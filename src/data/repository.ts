import type {
  Backup,
  BusinessRecord,
  ImportResult,
  OutboxMutation,
  RecordKind,
  RecordPayloads,
} from '../domain/types';
import {
  businessRecordSchema,
  initialSelfAssessmentSchema,
  payloadSchemas,
  scopeSchema,
  validateBackup,
} from '../domain/validation';
import { CharismaDatabase, db } from './database';

export const APP_VERSION = '2.0.0-p1';
export const GUEST_SCOPE = 'guest';
const PRIMARY_RECORD_KINDS = new Set<RecordKind>([
  'profile',
  'appSettings',
  'courseProgress',
  'lessonNote',
]);
const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const syncStatus = (scope: string) =>
  scope === GUEST_SCOPE ? ('local' as const) : ('pending' as const);

/** Stable comparisons ignore JSON object key ordering, preserving equal imported copies. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${JSON.stringify(key)}:${canonical(val)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

const sameContent = (a: BusinessRecord, b: BusinessRecord) =>
  a.kind === b.kind &&
  Boolean(a.deletedAt) === Boolean(b.deletedAt) &&
  canonical(a.payload) === canonical(b.payload);
function naturalKey(record: BusinessRecord): string | null {
  if (record.kind === 'profile' || record.kind === 'appSettings') return record.kind;
  if (record.kind === 'courseProgress' || record.kind === 'lessonNote') return `${record.kind}:${record.payload.lessonId}`;
  return null;
}

export class Repository {
  constructor(readonly database: CharismaDatabase = db, readonly ownerScope = GUEST_SCOPE) {
    scopeSchema.parse(ownerScope);
  }

  async list<K extends RecordKind>(kind: K, scope?: string): Promise<BusinessRecord<K>[]>;
  async list(kind?: undefined, scope?: string): Promise<BusinessRecord[]>;
  async list(kind?: RecordKind, scope?: string): Promise<BusinessRecord[]>;
  async list(kind?: RecordKind, scope = this.ownerScope): Promise<BusinessRecord[]> {
    scopeSchema.parse(scope);
    const records = kind
      ? await this.database.records.where('[ownerScope+kind]').equals([scope, kind]).toArray()
      : await this.database.records.where('ownerScope').equals(scope).toArray();
    return records
      .filter((record) => !record.deletedAt)
      .sort((a, b) => {
        const primaryOrder =
          kind && PRIMARY_RECORD_KINDS.has(kind)
            ? Number(Boolean(a.importedCopyOf)) - Number(Boolean(b.importedCopyOf))
            : 0;
        return primaryOrder || b.updatedAt.localeCompare(a.updatedAt);
      });
  }

  async get(id: string, scope = this.ownerScope): Promise<BusinessRecord | undefined> {
    scopeSchema.parse(scope);
    const record = await this.database.records.get([scope, id]);
    return record?.deletedAt ? undefined : record;
  }

  /** Resolves only after both the business record and its queue mutation commit. */
  async save<K extends RecordKind>(
    kind: K,
    payload: RecordPayloads[K],
    id?: string,
    scope = this.ownerScope,
  ): Promise<BusinessRecord<K>> {
    scopeSchema.parse(scope);
    const validatedPayload = payloadSchemas[kind].parse(payload);
    return this.database.transaction(
      'rw',
      this.database.records,
      this.database.outbox,
      async () => {
        const previous = id ? await this.database.records.get([scope, id]) : undefined;
        if (previous && previous.kind !== kind) throw new Error('记录类型与已有记录不一致。');
        if (previous?.deletedAt) throw new Error('这条记录已删除。请新建副本，避免旧数据复活。');
        const time = now();
        const record = businessRecordSchema.parse({
          id: id ?? uuid(),
          importedCopyOf: previous?.importedCopyOf,
          kind,
          ownerScope: scope,
          createdAt: previous?.createdAt ?? time,
          updatedAt: time,
          serverVersion: previous?.serverVersion ?? 0,
          serverUpdatedAt: previous?.serverUpdatedAt,
          localRevision: (previous?.localRevision ?? 0) + 1,
          syncStatus: syncStatus(scope),
          payload: validatedPayload,
        }) as BusinessRecord<K>;
        await this.database.records.put(record);
        await this.queue(record, 'upsert');
        return record;
      },
    );
  }

  async remove(id: string, scope = this.ownerScope): Promise<void> {
    scopeSchema.parse(scope);
    await this.database.transaction('rw', this.database.records, this.database.outbox, async () => {
      const previous = await this.database.records.get([scope, id]);
      if (!previous || previous.deletedAt) return;
      const time = now();
      const record: BusinessRecord = {
        ...previous,
        updatedAt: time,
        deletedAt: time,
        localRevision: previous.localRevision + 1,
        syncStatus: syncStatus(scope),
      };
      await this.database.records.put(record);
      await this.queue(record, 'delete');
    });
  }

  /** The answer sheet and dashboard evaluation are one indivisible submission. */
  async saveSelfAssessment(answers: number[], scores: Record<string, number>, scope = this.ownerScope) {
    scopeSchema.parse(scope);
    const validated = initialSelfAssessmentSchema.parse({ answers, scores });
    return this.database.transaction(
      'rw',
      this.database.records,
      this.database.outbox,
      async () => {
        const assessment = await this.save(
          'assessmentResult',
          { type: 'initial-self', ...validated },
          undefined,
          scope,
        );
        const evaluation = await this.save(
          'selfEvaluation',
          { scores: validated.scores },
          undefined,
          scope,
        );
        return { assessment, evaluation };
      },
    );
  }

  private async queue(
    record: BusinessRecord,
    operation: OutboxMutation['operation'],
  ): Promise<void> {
    const queued = await this.database.outbox
      .where('[ownerScope+entityId]')
      .equals([record.ownerScope, record.id])
      .toArray();
    // Only coalesce operations never attempted remotely. A retry keeps its immutable
    // mutation ID and payload because a timed-out server may already have committed it.
    const unsent = queued.find(
      (item) => (item.status === 'local' || item.status === 'pending') && item.retryCount === 0,
    );
    const time = now();
    await this.database.outbox.put({
      mutationId: unsent?.mutationId ?? uuid(),
      entityType: record.kind,
      entityId: record.id,
      ownerScope: record.ownerScope,
      operation,
      payload: record,
      baseVersion: unsent?.baseVersion ?? record.serverVersion,
      localRevision: record.localRevision,
      createdAt: unsent?.createdAt ?? time,
      updatedAt: time,
      retryCount: 0,
      nextRetryAt: time,
      status: record.ownerScope === GUEST_SCOPE ? 'local' : 'pending',
    });
  }

  async countOutbox(scope = this.ownerScope): Promise<number> {
    scopeSchema.parse(scope);
    return this.database.outbox.where('ownerScope').equals(scope).count();
  }

  async exportBackup(scope = this.ownerScope): Promise<Backup> {
    scopeSchema.parse(scope);
    const records = await this.database.records.where('ownerScope').equals(scope).toArray();
    return validateBackup({
      schemaVersion: 1,
      exportedAt: now(),
      appVersion: APP_VERSION,
      records,
    });
  }

  previewBackup(text: string): Backup {
    if (text.length > 50 * 1024 * 1024)
      throw new Error('备份超过 50 MB，请拆分文件后再导入。原有数据未改动。');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('备份不是有效的 JSON 文件。原有数据未改动。');
    }
    return validateBackup(parsed);
  }

  private async safetySnapshot(
    scope: string,
    reason: 'import-merge' | 'import-replace' | 'clear' | 'guest-migration' | 'conflict-resolution',
  ): Promise<string> {
    const id = uuid();
    // Deliberately separate from the destructive transaction. If importing fails,
    // the safety backup remains available and the previous records are rolled back.
    await this.database.transaction(
      'rw',
      this.database.records,
      this.database.safetyBackups,
      async () => {
        const records = await this.database.records.where('ownerScope').equals(scope).toArray();
        const time = now();
        await this.database.safetyBackups.add({
          id,
          ownerScope: scope,
          reason,
          createdAt: time,
          backup: validateBackup({
            schemaVersion: 1,
            appVersion: APP_VERSION,
            exportedAt: time,
            records,
          }),
        });
      },
    );
    return id;
  }

  async importBackup(
    value: Backup,
    mode: 'merge' | 'replace',
    scope = this.ownerScope,
  ): Promise<ImportResult> {
    scopeSchema.parse(scope);
    if (mode !== 'merge' && mode !== 'replace') throw new Error('请选择合并或替换。');
    if (scope.startsWith('user:') && mode === 'replace') throw new Error('账号空间仅允许合并恢复，请切换游客空间后使用替换。');
    // Validation happens before even a safety snapshot is written.
    const backup = validateBackup(value);
    const safetyBackupId = await this.safetySnapshot(
      scope,
      mode === 'merge' ? 'import-merge' : 'import-replace',
    );
    return this.database.transaction(
      'rw',
      this.database.records,
      this.database.outbox,
      this.database.conflicts,
      this.database.syncMetadata,
      async () => {
        if (mode === 'replace') await this.deleteScope(scope);
        const existing = await this.database.records.where('ownerScope').equals(scope).toArray();
        const byId = new Map(existing.map((record) => [record.id, record]));
        const result: ImportResult = { added: 0, copied: 0, skipped: 0, safetyBackupId };
        const account = scope.startsWith('user:');
        const sources = [...backup.records].sort((a, b) => Number(b.kind === 'trainingTask') - Number(a.kind === 'trainingTask'));
        for (const source of sources) {
          const key = naturalKey(source);
          const primary = mode === 'merge' && key
            ? existing.find((record) => !record.deletedAt && !record.importedCopyOf && naturalKey(record) === key)
            : undefined;
          // Replace starts from an empty scope. Imported rows must not become
          // "existing" matches for later backup rows with the same natural key.
          const previous = mode === 'merge' ? (byId.get(source.id) ?? primary) : undefined;
          const importKey = `backupImport:${source.ownerScope}:${source.id}:${source.localRevision}`;
          const mapped = account ? await this.database.syncMetadata.get([scope, importKey]) : undefined;
          const sourceSignature = canonical({ kind: source.kind, payload: source.payload, deleted: Boolean(source.deletedAt) });
          if (mapped?.value) {
            const prior = JSON.parse(mapped.value) as { id: string; content: string };
            if (prior.content === sourceSignature) { result.skipped++; continue; }
          }
          if (
            previous &&
            (sameContent(previous, source) ||
              existing.some((record) => sameContent(record, source)))
          ) {
            result.skipped++;
            continue;
          }
          const time = now();
          let payload = source.payload;
          if (account && source.kind === 'trainingRecord') {
            const task = await this.database.syncMetadata.get([scope, `backupImportLatest:${source.ownerScope}:${source.payload.taskId}`]);
            if (task?.value) payload = { ...source.payload, taskId: task.value };
          }
          const record = businessRecordSchema.parse({
            ...source,
            id: previous || account ? uuid() : source.id,
            importedCopyOf: previous ? previous.id : source.importedCopyOf,
            ownerScope: scope,
            payload,
            updatedAt: time,
            serverVersion: 0,
            serverUpdatedAt: undefined,
            localRevision: 1,
            syncStatus: syncStatus(scope),
          });
          await this.database.records.add(record);
          await this.queue(record, record.deletedAt ? 'delete' : 'upsert');
          if (account) await this.database.syncMetadata.put({ ownerScope: scope, key: importKey, value: JSON.stringify({ id: record.id, content: sourceSignature }) });
          if (account) await this.database.syncMetadata.put({ ownerScope: scope, key: `backupImportLatest:${source.ownerScope}:${source.id}`, value: record.id });
          byId.set(record.id, record);
          existing.push(record);
          if (previous) result.copied++;
          else result.added++;
        }
        return result;
      },
    );
  }

  /** Call only after UI confirmation. This clears one local scope, not cloud data. */
  async clear(scope = this.ownerScope): Promise<void> {
    scopeSchema.parse(scope);
    if (scope.startsWith('user:')) throw new Error('账号空间不能直接清空本机数据库，请使用逐条删除或云端删除申请。');
    await this.safetySnapshot(scope, 'clear');
    await this.database.transaction(
      'rw',
      this.database.records,
      this.database.outbox,
      this.database.conflicts,
      this.database.syncMetadata,
      () => this.deleteScope(scope),
    );
  }

  private async deleteScope(scope: string): Promise<void> {
    await this.database.records.where('ownerScope').equals(scope).delete();
    await this.database.outbox.where('ownerScope').equals(scope).delete();
    await this.database.conflicts.where('ownerScope').equals(scope).delete();
    await this.database.syncMetadata.where('ownerScope').equals(scope).delete();
  }

  async listSafetyBackups(scope = this.ownerScope) {
    scopeSchema.parse(scope);
    return this.database.safetyBackups
      .where('ownerScope')
      .equals(scope)
      .reverse()
      .sortBy('createdAt');
  }

  async getGuestMigrationState(scope = this.ownerScope): Promise<{ count: number; decision: 'merge' | 'keep' | 'cancel' | null }> {
    const records = await this.list(undefined, GUEST_SCOPE);
    const metadata = await this.database.syncMetadata.get([scope, 'guestMigrationDecision']);
    const decision = metadata?.value;
    return { count: records.length, decision: decision === 'merge' || decision === 'keep' || decision === 'cancel' ? decision : null };
  }
  async setGuestMigrationDecision(choice: 'merge' | 'keep' | 'cancel', scope = this.ownerScope): Promise<void> {
    if (!scope.startsWith('user:') || !['merge', 'keep', 'cancel'].includes(choice)) throw new Error('迁移选择需要有效的账号空间。');
    await this.database.syncMetadata.put({ ownerScope: scope, key: 'guestMigrationDecision', value: choice });
  }
  async migrateGuestToAccount(scope = this.ownerScope) {
    if (!scope.startsWith('user:')) throw new Error('游客记录只能迁移到明确的账号空间。');
    const safetyBackupId = uuid();
    return this.database.transaction('rw', this.database.records, this.database.outbox, this.database.syncMetadata, this.database.safetyBackups, async () => {
      const guest = (await this.database.records.where('ownerScope').equals(GUEST_SCOPE).toArray()).filter((record) => !record.deletedAt);
      const account = await this.database.records.where('ownerScope').equals(scope).toArray();
      const time = now();
      await this.database.safetyBackups.add({ id: safetyBackupId, ownerScope: GUEST_SCOPE, reason: 'guest-migration', createdAt: time,
        backup: validateBackup({ schemaVersion: 1, appVersion: APP_VERSION, exportedAt: time, records: await this.database.records.where('ownerScope').equals(GUEST_SCOPE).toArray() }) });
      await this.database.safetyBackups.add({ id: uuid(), ownerScope: scope, reason: 'guest-migration', createdAt: time,
        backup: validateBackup({ schemaVersion: 1, appVersion: APP_VERSION, exportedAt: time, records: account }) });
      const result = { added: 0, copied: 0, skipped: 0, sourceCount: guest.length, safetyBackupId };
      guest.sort((a, b) => Number(b.kind === 'trainingTask') - Number(a.kind === 'trainingTask'));
      for (const source of guest) {
        const key = `guestMigration:${source.id}:${source.localRevision}`;
        if (await this.database.syncMetadata.get([scope, key])) { result.skipped++; continue; }
        const natural = naturalKey(source);
        const primary = natural ? account.find((record) => !record.deletedAt && !record.importedCopyOf && naturalKey(record) === natural) : undefined;
        if (primary && sameContent(primary, source)) {
          await this.database.syncMetadata.put({ ownerScope: scope, key, value: primary.id });
          result.skipped++; continue;
        }
        let payload = source.payload;
        if (source.kind === 'trainingRecord') {
          const task = await this.database.syncMetadata.get([scope, `guestMigrationLatest:${source.payload.taskId}`]);
          if (task?.value) payload = { ...source.payload, taskId: task.value };
        }
        const record = businessRecordSchema.parse({ ...source, id: uuid(), ownerScope: scope,
          importedCopyOf: primary?.id ?? source.importedCopyOf, payload,
          updatedAt: time, serverVersion: 0, serverUpdatedAt: undefined, localRevision: 1, syncStatus: 'pending' });
        await this.database.records.add(record);
        await this.queue(record, 'upsert');
        await this.database.syncMetadata.put({ ownerScope: scope, key, value: record.id });
        await this.database.syncMetadata.put({ ownerScope: scope, key: `guestMigrationLatest:${source.id}`, value: record.id });
        account.push(record);
        if (primary) result.copied++; else result.added++;
      }
      await this.database.syncMetadata.put({ ownerScope: scope, key: 'guestMigrationDecision', value: 'merge' });
      return result;
    });
  }
  async listConflicts(scope = this.ownerScope) {
    return this.database.conflicts.where('ownerScope').equals(scope).filter((record) => !record.resolvedAt).toArray();
  }
  async resolveConflict(id: string, choice: 'local' | 'remote' | 'merge', mergedPayload?: unknown, scope = this.ownerScope): Promise<void> {
    if (!scope.startsWith('user:') || !['local', 'remote', 'merge'].includes(choice)) throw new Error('请选择有效的账号冲突解决方式。');
    await this.database.transaction('rw', this.database.records, this.database.outbox, this.database.conflicts, async () => {
      const conflict = await this.database.conflicts.get(id);
      if (!conflict || conflict.ownerScope !== scope || conflict.resolvedAt) throw new Error('冲突不属于当前账号或已解决。');
      const local = await this.database.records.get([scope, conflict.entityId]);
      if (!local) throw new Error('本机记录不存在。');
      const remote = conflict.remote;
      const payload = choice === 'merge' ? payloadSchemas[local.kind].parse(mergedPayload) : local.payload;
      const time = now();
      // Preserve the losing live version before replacing any content. Deleted
      // cloud IDs stay deleted; keeping local content creates a new identifier.
      const preserve = choice === 'local' && remote && !remote.deletedAt ? remote : local;
      if (!preserve.deletedAt) {
        const copy = businessRecordSchema.parse({ ...preserve, id: uuid(), importedCopyOf: local.id,
          ownerScope: scope, payload: (remote?.deletedAt || !remote) && choice !== 'remote' ? payload : preserve.payload,
          createdAt: time, updatedAt: time, deletedAt: undefined, serverVersion: 0, serverUpdatedAt: undefined, localRevision: 1, syncStatus: 'pending' });
        await this.database.records.add(copy);
        await this.queue(copy, 'upsert');
      }
      await this.database.outbox.where('[ownerScope+entityId]').equals([scope, local.id]).delete();
      if (choice === 'remote' || remote?.deletedAt || !remote) {
        await this.database.records.put(remote ? { ...remote, localRevision: local.localRevision + 1 } : {
          ...local, deletedAt: time, updatedAt: time, syncStatus: 'synced', localRevision: local.localRevision + 1,
        });
      } else {
        const resolved = businessRecordSchema.parse({ ...local, payload, updatedAt: time,
          deletedAt: choice === 'merge' ? undefined : local.deletedAt,
          localRevision: local.localRevision + 1, serverVersion: remote.serverVersion,
          serverUpdatedAt: remote.serverUpdatedAt, syncStatus: 'pending' });
        await this.database.records.put(resolved);
        await this.queue(resolved, resolved.deletedAt ? 'delete' : 'upsert');
      }
      await this.database.conflicts.put({ ...conflict, local, resolvedAt: time });
    });
  }
}

export const repository = new Repository();
