import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { CharismaDatabase } from '../data/database';
import { Repository } from '../data/repository';
import { SyncEngine } from '../sync/engine';
import type { ApplyResult, RemoteRecord, RemoteTransport, SnapshotPage } from '../sync/protocol';
import type { OutboxMutation, RecordPayloads } from '../domain/types';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SCOPE = `user:abcdef1234567890:${USER}`;
const databases: CharismaDatabase[] = [];
const engines: SyncEngine[] = [];
const journal = (body: string): RecordPayloads['journalEntry'] => ({ title: '私人复盘', body, category: '每日成长', tags: ['表达'], date: '2026-10-13' });
const clone = <T,>(value: T): T => structuredClone(value);
const authError = () => Object.assign(new Error('登录会话失效'), { code: 'AUTH_REQUIRED' });
function deferred() { let resolve!: () => void; const promise = new Promise<void>((accept) => { resolve = accept; }); return { promise, resolve }; }

/** A server contract double: atomic CAS, tombstones, immutable operation receipts,
 * per-account snapshot revision and keyset pagination. No network is simulated as
 * a successful hosted Supabase connection. */
class FakeRemote {
  records = new Map<string, RemoteRecord>();
  receipts = new Map<string, { signature: string; result: ApplyResult }>();
  revision = 0;
  calls: OutboxMutation[] = [];
  afterCommitFailure = false;
  beforeApply?: (mutation: OutboxMutation) => Promise<void>;
  beforeSnapshot?: () => void;
  pageSize = 1;
  transport(userId = USER): RemoteTransport {
    return { apply: (mutation) => this.apply(mutation, userId), snapshot: (after, revision) => this.snapshot(after, revision, userId) };
  }
  async apply(mutation: OutboxMutation, userId: string): Promise<ApplyResult> {
    this.calls.push(clone(mutation));
    if (this.beforeApply) await this.beforeApply(mutation);
    const key = `${userId}:${mutation.entityId}`;
    const receiptKey = `${userId}:${mutation.mutationId}`;
    const signature = JSON.stringify([mutation.entityId, mutation.entityType, mutation.operation, mutation.baseVersion, mutation.payload]);
    const prior = this.receipts.get(receiptKey);
    if (prior) { if (prior.signature !== signature) throw new Error('幂等操作内容被改动'); return clone(prior.result); }
    const current = this.records.get(key);
    if ((current?.version ?? 0) !== mutation.baseVersion || (current?.deleted_at && mutation.operation === 'upsert')) {
      return { status: 'conflict', record: clone(current ?? null) };
    }
    const time = new Date(Date.UTC(2026, 9, 13) + ++this.revision).toISOString();
    const row: RemoteRecord = {
      id: mutation.entityId, owner_id: userId, kind: mutation.entityType, payload: clone(mutation.payload.payload),
      version: (current?.version ?? 0) + 1, created_at: current?.created_at ?? time, updated_at: time,
      client_created_at: mutation.payload.createdAt, client_updated_at: mutation.payload.updatedAt,
      deleted_at: mutation.operation === 'delete' ? time : null,
      imported_copy_of: mutation.payload.importedCopyOf ?? null,
    };
    this.records.set(key, row);
    const result: ApplyResult = { status: 'applied', record: row };
    this.receipts.set(receiptKey, { signature, result: clone(result) });
    if (this.afterCommitFailure) { this.afterCommitFailure = false; throw Object.assign(new Error('响应超时，但服务端已提交'), { code: 'NETWORK' }); }
    return clone(result);
  }
  async snapshot(afterId: string | null, expected: number | null, userId: string): Promise<SnapshotPage> {
    this.beforeSnapshot?.();
    if (expected !== null && expected !== this.revision) return { revision: this.revision, changed: true, records: [], nextCursor: null };
    const rows = [...this.records.values()].filter((row) => row.owner_id === userId && (!afterId || row.id > afterId)).sort((a, b) => a.id.localeCompare(b.id));
    const records = clone(rows.slice(0, this.pageSize));
    return { revision: this.revision, changed: false, records, nextCursor: rows.length > this.pageSize ? records.at(-1)!.id : null };
  }
}
function device(remote: FakeRemote, options: { scope?: string; userId?: string; isCurrent?: () => boolean } = {}) {
  const database = new CharismaDatabase(`sync-test-${crypto.randomUUID()}`);
  databases.push(database);
  const scope = options.scope ?? SCOPE;
  const userId = options.userId ?? USER;
  const repository = new Repository(database, scope);
  const engine = new SyncEngine({ database, scope, userId, transport: remote.transport(userId), isCurrent: options.isCurrent ?? (() => true) });
  engines.push(engine);
  return { database, repository, engine };
}
afterEach(async () => { engines.splice(0).forEach((engine) => engine.stop()); await Promise.all(databases.splice(0).map((database) => database.delete())); });

describe('reliable two-way sync', () => {
  it('synchronizes both devices using scoped, paginated data and persists the last complete sync', async () => {
    const remote = new FakeRemote();
    const a = device(remote); const b = device(remote);
    const first = await a.repository.save('journalEntry', journal('电脑的记录'));
    await a.repository.save('journalEntry', journal('第二条记录，验证分页'));
    expect((await a.engine.run()).error).toBeUndefined();
    await b.engine.run();
    expect(await b.repository.list('journalEntry')).toHaveLength(2);
    await b.repository.save('journalEntry', journal('手机修改的内容'), first.id);
    await b.engine.run(); await a.engine.run();
    expect((await a.repository.get(first.id))?.payload).toEqual(journal('手机修改的内容'));
    expect(await a.repository.countOutbox()).toBe(0);
    expect((await a.database.syncMetadata.get([SCOPE, 'sync']))?.lastSuccessAt).toBeTruthy();
  });

  it('recovers an already committed timeout with the same immutable mutation and no duplicate row', async () => {
    const remote = new FakeRemote(); const a = device(remote);
    const saved = await a.repository.save('journalEntry', journal('离线草稿'));
    remote.afterCommitFailure = true;
    expect((await a.engine.run()).error).toContain('超时');
    const original = (await a.database.outbox.toArray())[0];
    expect(original.status).toBe('retry'); expect(original.retryCount).toBe(1);
    expect(await a.repository.get(saved.id)).toBeTruthy();
    const result = await a.engine.run({ force: true });
    expect(result.error).toBeUndefined();
    expect(remote.records.size).toBe(1); expect(remote.receipts.size).toBe(1);
    expect(remote.calls[1].mutationId).toBe(remote.calls[0].mutationId);
    expect(remote.calls[1].payload).toEqual(remote.calls[0].payload);
    expect(await a.repository.countOutbox()).toBe(0);
  });

  it('preserves an edit made during a request and rebases only its never-sent successor', async () => {
    const remote = new FakeRemote(); const a = device(remote); const wait = deferred();
    let entered!: () => void;
    const started = new Promise<void>((accept) => { entered = accept; });
    remote.beforeApply = async () => { remote.beforeApply = undefined; entered(); await wait.promise; };
    const saved = await a.repository.save('journalEntry', journal('第一版'));
    const run = a.engine.run(); await started;
    const attempted = (await a.database.outbox.toArray())[0];
    expect(attempted.retryCount).toBe(1); expect(attempted.status).toBe('sending');
    await a.repository.save('journalEntry', journal('请求期间继续编辑的第二版'), saved.id);
    expect(await a.repository.countOutbox()).toBe(2);
    wait.resolve(); await run;
    const local = await a.repository.get(saved.id);
    expect(local?.payload).toEqual(journal('请求期间继续编辑的第二版'));
    expect(local?.serverVersion).toBe(2); expect(local?.syncStatus).toBe('synced');
    expect(remote.calls[0].baseVersion).toBe(0); expect(remote.calls[1].baseVersion).toBe(1);
    expect(remote.calls[1].mutationId).not.toBe(remote.calls[0].mutationId);
  });

  it('ignores a response arriving after logout and recovers the sending queue in a fresh session', async () => {
    const remote = new FakeRemote(); let current = true;
    const a = device(remote, { isCurrent: () => current }); const wait = deferred();
    let entered!: () => void; const started = new Promise<void>((accept) => { entered = accept; });
    remote.beforeApply = async () => { remote.beforeApply = undefined; entered(); await wait.promise; };
    const saved = await a.repository.save('journalEntry', journal('退出前的内容'));
    const run = a.engine.run(); await started; current = false; a.engine.stop(); wait.resolve(); await run;
    expect((await a.repository.get(saved.id))?.serverVersion).toBe(0);
    expect((await a.database.outbox.toArray())[0].status).toBe('sending');
    current = true;
    const recovered = new SyncEngine({ database: a.database, scope: SCOPE, userId: USER, transport: remote.transport(), isCurrent: () => current });
    engines.push(recovered); await recovered.run({ force: true });
    expect(await a.repository.countOutbox()).toBe(0); expect(remote.records.size).toBe(1);
  });

  it('keeps retries durable on an expired session and respects backoff without blocking local edits', async () => {
    const remote = new FakeRemote(); const a = device(remote);
    remote.beforeApply = async () => { throw authError(); };
    const saved = await a.repository.save('journalEntry', journal('会话失效时仍保留'));
    const failed = await a.engine.run();
    expect(failed.authRequired).toBe(true);
    const mutation = (await a.database.outbox.toArray())[0];
    expect(new Date(mutation.nextRetryAt).getTime()).toBeGreaterThan(Date.now());
    await a.repository.save('journalEntry', journal('离线继续写'), saved.id);
    await a.engine.run(); expect(remote.calls).toHaveLength(1);
    remote.beforeApply = undefined; await a.engine.run({ force: true });
    expect((await a.repository.get(saved.id))?.payload).toEqual(journal('离线继续写'));
    expect(await a.repository.countOutbox()).toBe(0);
  });

  it('allows independent operations to succeed while one server failure keeps its queue intact', async () => {
    const remote = new FakeRemote(); const a = device(remote);
    const fail = await a.repository.save('journalEntry', journal('暂时失败的记录'));
    await a.repository.save('journalEntry', journal('独立记录仍可提交'));
    remote.beforeApply = async (mutation) => { if (mutation.entityId === fail.id) throw new Error('server 500'); };
    await a.engine.run();
    expect(remote.records.size).toBe(1); expect(await a.repository.countOutbox()).toBe(1);
    expect(await a.repository.list()).toHaveLength(2);
    remote.beforeApply = undefined; await a.engine.run({ force: true });
    expect(remote.records.size).toBe(2); expect(await a.repository.countOutbox()).toBe(0);
  });
});

describe('version conflicts and deletion', () => {
  it('preserves both versions, refreshes an existing conflict and resolves using edits made after detection', async () => {
    const remote = new FakeRemote(); const a = device(remote); const b = device(remote);
    const saved = await a.repository.save('journalEntry', journal('最初的版本'));
    await a.engine.run(); await b.engine.run();
    await a.repository.save('journalEntry', journal('电脑离线编辑'), saved.id);
    await b.repository.save('journalEntry', journal('手机在线编辑'), saved.id); await b.engine.run();
    await a.engine.run();
    let conflict = (await a.repository.listConflicts())[0];
    expect(conflict.local.payload).toEqual(journal('电脑离线编辑'));
    expect(conflict.remote?.payload).toEqual(journal('手机在线编辑'));
    expect((await a.repository.get(saved.id))?.payload).toEqual(journal('电脑离线编辑'));
    await a.repository.save('journalEntry', journal('发现冲突后继续完善'), saved.id);
    await a.engine.run();
    expect(await a.repository.listConflicts()).toHaveLength(1);
    conflict = (await a.repository.listConflicts())[0];
    expect(conflict.local.payload).toEqual(journal('发现冲突后继续完善'));
    await a.repository.resolveConflict(conflict.id, 'local'); await a.engine.run({ force: true });
    expect(remote.records.get(`${USER}:${saved.id}`)?.payload).toEqual(journal('发现冲突后继续完善'));
    expect((await a.repository.list('journalEntry')).some((record) => record.payload.body === '手机在线编辑')).toBe(true);
    expect(await a.repository.listConflicts()).toHaveLength(0);
  });

  it('accepting the cloud version preserves the latest local content as a new copy', async () => {
    const remote = new FakeRemote(); const a = device(remote); const b = device(remote);
    const saved = await a.repository.save('journalEntry', journal('初稿')); await a.engine.run(); await b.engine.run();
    await a.repository.save('journalEntry', journal('本机不同版本'), saved.id);
    await b.repository.save('journalEntry', journal('云端不同版本'), saved.id); await b.engine.run(); await a.engine.run();
    await a.repository.save('journalEntry', journal('本机又新增一段'), saved.id);
    await a.repository.resolveConflict((await a.repository.listConflicts())[0].id, 'remote');
    expect((await a.repository.get(saved.id))?.payload).toEqual(journal('云端不同版本'));
    const copy = (await a.repository.list('journalEntry')).find((record) => record.importedCopyOf === saved.id);
    expect(copy?.payload).toEqual(journal('本机又新增一段'));
  });

  it('retains a cloud tombstone and restores chosen local content under a new UUID', async () => {
    const remote = new FakeRemote(); const a = device(remote); const b = device(remote);
    const saved = await a.repository.save('journalEntry', journal('原内容')); await a.engine.run(); await b.engine.run();
    await a.repository.save('journalEntry', journal('离线修改需要保留'), saved.id);
    await b.repository.remove(saved.id); await b.engine.run(); await a.engine.run();
    expect((await a.repository.listConflicts())[0].remote?.deletedAt).toBeTruthy();
    await a.repository.resolveConflict((await a.repository.listConflicts())[0].id, 'local'); await a.engine.run({ force: true });
    expect(await a.repository.get(saved.id)).toBeUndefined();
    expect(remote.records.get(`${USER}:${saved.id}`)?.deleted_at).toBeTruthy();
    const copy = (await a.repository.list('journalEntry'))[0];
    expect(copy.id).not.toBe(saved.id); expect(copy.payload.body).toBe('离线修改需要保留');
    await b.engine.run(); expect(await b.repository.get(saved.id)).toBeUndefined();
  });
});

describe('snapshot and identity safety', () => {
  it('restarts changed pagination snapshots and never marks perpetual changes as a successful sync', async () => {
    const remote = new FakeRemote(); const a = device(remote);
    await a.repository.save('journalEntry', journal('第一条')); await a.repository.save('journalEntry', journal('第二条')); await a.engine.run();
    const b = device(remote); let calls = 0;
    remote.beforeSnapshot = () => { if (++calls === 2) remote.revision++; };
    await b.engine.run(); expect(await b.repository.list()).toHaveLength(2);
    expect(calls).toBeGreaterThan(3);
    const c = device(remote); remote.beforeSnapshot = () => { remote.revision++; };
    expect((await c.engine.run()).error).toContain('持续变化');
    expect(await c.repository.list()).toHaveLength(0);
    expect((await c.database.syncMetadata.get([SCOPE, 'sync']))?.lastSuccessAt).toBeUndefined();
  });

  it('blocks foreign-owner remote data and isolates account/private local spaces', async () => {
    const remote = new FakeRemote(); const a = device(remote);
    const saved = await a.repository.save('journalEntry', journal('A私密')); await a.engine.run();
    const b = device(remote, { userId: OTHER, scope: `user:abcdef1234567890:${OTHER}` });
    await b.engine.run(); expect(await b.repository.list()).toHaveLength(0);
    const bad = new SyncEngine({ database: b.database, scope: b.repository.ownerScope, userId: OTHER, isCurrent: () => true,
      transport: { apply: remote.transport(OTHER).apply, snapshot: async () => ({ revision: 1, changed: false, records: [clone(remote.records.get(`${USER}:${saved.id}`)!)], nextCursor: null }) } });
    engines.push(bad);
    expect((await bad.run()).error).toContain('其他账号'); expect(await b.repository.list()).toHaveLength(0);
    expect(await new Repository(a.database).list()).toHaveLength(0);
  });
});

describe('guest migration and account backup isolation', () => {
  it('migrates transactionally, preserves guest records and account primaries, and is idempotent by source revision', async () => {
    const remote = new FakeRemote(); const a = device(remote); const guest = new Repository(a.database);
    const profile = { name: '游客', focus: ['M04'], dailyMinutes: 5, weeklyDays: 3, scene: '校园', goal: '表达', startDate: '2026-10-13' };
    const account = await a.repository.save('profile', { ...profile, name: '账号原计划' });
    const guestProfile = await guest.save('profile', profile);
    await guest.save('journalEntry', journal('游客私密日志'));
    const result = await a.repository.migrateGuestToAccount();
    expect(result.added).toBe(1); expect(result.copied).toBe(1);
    expect(await guest.list()).toHaveLength(2);
    expect((await a.repository.list('profile'))[0].id).toBe(account.id);
    expect(await a.repository.get(guestProfile.id)).toBeUndefined();
    expect((await a.repository.migrateGuestToAccount()).skipped).toBe(2);
    expect(await a.repository.list()).toHaveLength(3);
    expect((await a.repository.getGuestMigrationState()).decision).toBe('merge');
    await a.engine.run(); expect(remote.records.size).toBe(3);
    await expect(a.repository.clear()).rejects.toThrow('不能直接清空');
    await expect(a.repository.importBackup(await guest.exportBackup(), 'replace')).rejects.toThrow('仅允许合并');
  });

  it('imports a missing old server ID as a fresh account ID and preserves linked custom tasks', async () => {
    const remote = new FakeRemote(); const a = device(remote); const guest = new Repository(a.database);
    const task = await guest.save('trainingTask', { title: '我的任务', moduleId: 'M04', minutes: 5, description: '一分钟表达' });
    await guest.save('trainingRecord', { taskId: task.id, title: '我的任务', moduleId: 'M04', minutes: 5, date: '2026-10-13', difficulty: '轻量', reflection: '', completed: true });
    const backup = await guest.exportBackup();
    await a.repository.importBackup(backup, 'merge');
    const importedTask = (await a.repository.list('trainingTask'))[0];
    const importedRecord = (await a.repository.list('trainingRecord'))[0];
    expect(importedTask.id).not.toBe(task.id);
    expect(importedRecord.payload.taskId).toBe(importedTask.id);
    expect((await a.repository.importBackup(backup, 'merge')).skipped).toBe(2);
    expect(await a.repository.list()).toHaveLength(2);
  });
});
