import { db, type CharismaDatabase } from '../data/database';
import type { BusinessRecord, OutboxMutation } from '../domain/types';
import { fromRemote, type RemoteRecord, type RemoteTransport, type SyncState } from './protocol';

export interface SyncEngineOptions {
  database?: CharismaDatabase;
  transport: RemoteTransport;
  scope: string;
  userId: string;
  isCurrent: () => boolean;
  onState?: (state: SyncState) => void;
  withLock?: (name: string, task: () => Promise<void>) => Promise<void>;
  now?: () => number;
}
class StaleSession extends Error {}
// Serial fallback is shared by engines in this tab. Cross-tab safety comes from
// Web Locks; immutable mutation receipts and CAS still protect the server.
const fallbackLocks = new Map<string, Promise<void>>();
async function defaultLock(name: string, task: () => Promise<void>) {
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    await navigator.locks.request(name, task);
    return;
  }
  const previous = fallbackLocks.get(name) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  fallbackLocks.set(name, next);
  try { await next; } finally { if (fallbackLocks.get(name) === next) fallbackLocks.delete(name); }
}

export class SyncEngine {
  private readonly database: CharismaDatabase;
  private readonly now: () => number;
  private stopped = false;
  private epoch = 0;
  private running: Promise<SyncState> | null = null;
  private state: SyncState = { running: false, pending: 0, conflicts: 0, authRequired: false };
  constructor(private readonly options: SyncEngineOptions) {
    this.database = options.database ?? db;
    this.now = options.now ?? Date.now;
    const suffix = options.scope.split(':').at(-1);
    if (!/^user:(?:[a-f0-9]{16}:)?[a-f0-9-]{36}$/i.test(options.scope) || suffix !== options.userId) {
      throw new Error('同步空间必须属于明确的当前云端账号。');
    }
  }
  stop() { this.stopped = true; this.epoch++; }
  private current(epoch: number) { return !this.stopped && this.epoch === epoch && this.options.isCurrent(); }
  private assertCurrent(epoch: number) { if (!this.current(epoch)) throw new StaleSession('账号会话已切换'); }
  private iso() { return new Date(this.now()).toISOString(); }
  private emit(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    if (!this.stopped && this.options.isCurrent()) this.options.onState?.(this.state);
  }
  async run({ force = false }: { force?: boolean } = {}): Promise<SyncState> {
    if (this.running) return this.running;
    if (this.stopped || !this.options.isCurrent()) return this.state;
    const epoch = this.epoch;
    const task = async () => {
      this.assertCurrent(epoch);
      this.emit({ running: true, error: undefined, authRequired: false });
      try {
        await this.recoverSending(epoch);
        const pushed = await this.push(epoch, force);
        if (pushed) await this.pull(epoch);
        this.assertCurrent(epoch);
        const pending = await this.database.outbox.where('ownerScope').equals(this.options.scope).count();
        const conflicts = await this.database.conflicts.where('ownerScope').equals(this.options.scope).filter((record) => !record.resolvedAt).count();
        this.assertCurrent(epoch);
        if (pushed && !pending && !conflicts) {
          const time = this.iso();
          await this.database.transaction('rw', this.database.syncMetadata, async () => {
            this.assertCurrent(epoch);
            await this.database.syncMetadata.put({ ownerScope: this.options.scope, key: 'sync', lastSuccessAt: time });
            this.assertCurrent(epoch);
          });
          this.emit({ lastSuccessAt: time });
        }
        this.emit({ pending, conflicts });
      } catch (error) {
        if (!(error instanceof StaleSession)) await this.recordError(error, epoch);
      } finally { this.emit({ running: false }); }
    };
    this.running = (async () => {
      try { await (this.options.withLock ?? defaultLock)(`charisma-sync:${this.options.scope}`, task); }
      catch (error) { if (!(error instanceof StaleSession)) await this.recordError(error, epoch); }
      return this.state;
    })();
    try { return await this.running; } finally { this.running = null; }
  }
  private async recordError(error: unknown, epoch: number) {
    if (!this.current(epoch)) return;
    const message = error instanceof Error ? error.message : '同步失败，本地记录仍然保留。';
    const authRequired = (error as { code?: string })?.code === 'AUTH_REQUIRED';
    await this.database.transaction('rw', this.database.syncMetadata, async () => {
      this.assertCurrent(epoch);
      const previous = await this.database.syncMetadata.get([this.options.scope, 'sync']);
      await this.database.syncMetadata.put({ ...previous, ownerScope: this.options.scope, key: 'sync', lastError: message });
      this.assertCurrent(epoch);
    });
    this.emit({ error: message, authRequired });
  }
  private async recoverSending(epoch: number) {
    await this.database.transaction('rw', this.database.outbox, async () => {
      this.assertCurrent(epoch);
      const sending = await this.database.outbox.where('[ownerScope+status]').equals([this.options.scope, 'sending']).toArray();
      for (const mutation of sending) await this.database.outbox.update(mutation.mutationId, { status: 'retry', nextRetryAt: this.iso() });
      this.assertCurrent(epoch);
    });
  }
  private async push(epoch: number, force: boolean): Promise<boolean> {
    let successful = true;
    const failedEntities = new Set<string>();
    for (let step = 0; step < 200; step++) {
      this.assertCurrent(epoch);
      const queue = await this.database.outbox.where('ownerScope').equals(this.options.scope).toArray();
      const heads = new Map<string, OutboxMutation>();
      queue.sort((a, b) => a.localRevision - b.localRevision || a.createdAt.localeCompare(b.createdAt) || a.mutationId.localeCompare(b.mutationId));
      for (const mutation of queue) if (!heads.has(mutation.entityId)) heads.set(mutation.entityId, mutation);
      const next = [...heads.values()].find((mutation) => !failedEntities.has(mutation.entityId)
        && mutation.status !== 'conflict' && mutation.status !== 'local'
        && (force || new Date(mutation.nextRetryAt).getTime() <= this.now()));
      if (!next) return successful;
      const sending = await this.database.transaction('rw', this.database.outbox, async () => {
        this.assertCurrent(epoch);
        const latest = await this.database.outbox.get(next.mutationId);
        if (!latest || latest.status === 'conflict') return undefined;
        const updated: OutboxMutation = { ...latest, status: 'sending', retryCount: latest.retryCount + 1 };
        await this.database.outbox.put(updated);
        this.assertCurrent(epoch);
        return updated;
      });
      if (!sending) continue;
      try {
        const result = await this.options.transport.apply(sending);
        this.assertCurrent(epoch);
        if (result.status === 'conflict') await this.conflict(sending, result.record, epoch);
        else {
          if (!result.record || result.record.id !== sending.entityId || result.record.kind !== sending.entityType) throw new Error('服务端确认记录与请求不一致。');
          await this.acknowledge(sending, result.record, epoch);
        }
      } catch (error) {
        if (error instanceof StaleSession) throw error;
        successful = false;
        failedEntities.add(sending.entityId);
        await this.database.transaction('rw', this.database.outbox, async () => {
          this.assertCurrent(epoch);
          const message = error instanceof Error ? error.message : '同步请求失败';
          const delay = Math.min(300_000, 1000 * 2 ** Math.min(sending.retryCount - 1, 9));
          await this.database.outbox.update(sending.mutationId, { status: 'retry', nextRetryAt: new Date(this.now() + delay).toISOString(), lastError: message });
          this.assertCurrent(epoch);
        });
        await this.recordError(error, epoch);
        if ((error as { code?: string })?.code === 'AUTH_REQUIRED') return false;
      }
    }
    return false; // More work remains; the next activation/run continues it.
  }
  private async acknowledge(mutation: OutboxMutation, remote: RemoteRecord, epoch: number) {
    const confirmed = fromRemote(remote, this.options.scope, this.options.userId, mutation.localRevision);
    await this.database.transaction('rw', this.database.records, this.database.outbox, async () => {
      this.assertCurrent(epoch);
      const current = await this.database.records.get([this.options.scope, mutation.entityId]);
      const exists = await this.database.outbox.get(mutation.mutationId);
      if (!exists) return;
      if (current) await this.database.records.put(current.localRevision === mutation.localRevision ? confirmed : {
        ...current, serverVersion: confirmed.serverVersion, serverUpdatedAt: confirmed.serverUpdatedAt,
      });
      await this.database.outbox.delete(mutation.mutationId);
      const successors = await this.database.outbox.where('[ownerScope+entityId]').equals([this.options.scope, mutation.entityId]).toArray();
      for (const successor of successors) {
        if (successor.retryCount === 0 && successor.status !== 'conflict') await this.database.outbox.update(successor.mutationId, {
          baseVersion: confirmed.serverVersion,
          payload: { ...successor.payload, serverVersion: confirmed.serverVersion, serverUpdatedAt: confirmed.serverUpdatedAt },
        });
      }
      this.assertCurrent(epoch);
    });
  }
  private async conflict(mutation: OutboxMutation | undefined, remote: RemoteRecord | null, epoch: number, entityId = mutation?.entityId) {
    if (!entityId) throw new Error('冲突缺少记录标识');
    const cloud = remote ? fromRemote(remote, this.options.scope, this.options.userId) : null;
    if (cloud && cloud.id !== entityId) throw new Error('冲突记录标识不一致');
    await this.database.transaction('rw', this.database.records, this.database.outbox, this.database.conflicts, async () => {
      this.assertCurrent(epoch);
      const local = await this.database.records.get([this.options.scope, entityId]);
      if (!local) return;
      const prior = await this.database.conflicts.where('[ownerScope+entityId]').equals([this.options.scope, entityId]).filter((record) => !record.resolvedAt).first();
      await this.database.conflicts.put({ id: prior?.id ?? crypto.randomUUID(), ownerScope: this.options.scope,
        entityId, local, remote: cloud, mutationId: mutation?.mutationId ?? prior?.mutationId,
        detectedAt: prior?.detectedAt ?? this.iso() });
      const mutations = await this.database.outbox.where('[ownerScope+entityId]').equals([this.options.scope, entityId]).toArray();
      for (const item of mutations) await this.database.outbox.update(item.mutationId, { status: 'conflict' });
      this.assertCurrent(epoch);
    });
  }
  private async pull(epoch: number) {
    for (let restart = 0; restart < 3; restart++) {
      let cursor: string | null = null;
      let revision: number | null = null;
      const records: RemoteRecord[] = [];
      const ids = new Set<string>();
      let changed = false;
      for (let page = 0; page < 10_000; page++) {
        const result = await this.options.transport.snapshot(cursor, revision);
        this.assertCurrent(epoch);
        if (!Number.isSafeInteger(result.revision) || result.revision < 0) throw new Error('云端快照版本无效');
        if (result.changed || (revision !== null && result.revision !== revision)) { changed = true; break; }
        revision = result.revision;
        for (const record of result.records) {
          fromRemote(record, this.options.scope, this.options.userId);
          if (ids.has(record.id) || (cursor && record.id <= cursor) || (records.at(-1) && record.id <= records.at(-1)!.id)) throw new Error('云端分页返回重复或倒序记录');
          ids.add(record.id); records.push(record);
        }
        if (result.nextCursor === null) {
          // Recheck revision after the final page; never commit a mixed snapshot.
          const final = await this.options.transport.snapshot(records.at(-1)?.id ?? cursor, revision);
          this.assertCurrent(epoch);
          if (final.changed || final.revision !== revision) changed = true;
          else if (final.records.length || final.nextCursor !== null) throw new Error('云端快照结束位置不一致');
          break;
        }
        if (!result.records.length || result.nextCursor !== result.records.at(-1)?.id || (cursor && result.nextCursor <= cursor)) throw new Error('云端分页游标无效');
        cursor = result.nextCursor;
        if (page === 9999) throw new Error('云端快照超过分页上限，请稍后重试');
      }
      if (changed) continue;
      // One transaction applies a fully validated snapshot. Pending local edits
      // are retained and become explicit conflicts if remote versions diverge.
      await this.database.transaction('rw', this.database.records, this.database.outbox, this.database.conflicts, async () => {
        this.assertCurrent(epoch);
        for (const remote of records) {
          const local = await this.database.records.get([this.options.scope, remote.id]);
          const queue = await this.database.outbox.where('[ownerScope+entityId]').equals([this.options.scope, remote.id]).toArray();
          const existingConflict = await this.database.conflicts.where('[ownerScope+entityId]').equals([this.options.scope, remote.id]).filter((record) => !record.resolvedAt).first();
          if (existingConflict || (queue.length && remote.version !== local?.serverVersion)) {
            await this.conflict(queue[0], remote, epoch, remote.id);
          } else if (!queue.length && (!local || remote.version > local.serverVersion)) {
            await this.database.records.put(fromRemote(remote, this.options.scope, this.options.userId, local?.localRevision ?? 1));
          }
        }
        this.assertCurrent(epoch);
      });
      return;
    }
    throw new Error('云端数据持续变化，快照未完整确认。稍后重试，本地数据仍保留。');
  }
}
