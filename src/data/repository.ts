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

export const APP_VERSION = '2.0.0-p0';
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

export class Repository {
  constructor(readonly database: CharismaDatabase = db) {}

  async list<K extends RecordKind>(kind: K, scope?: string): Promise<BusinessRecord<K>[]>;
  async list(kind?: undefined, scope?: string): Promise<BusinessRecord[]>;
  async list(kind?: RecordKind, scope?: string): Promise<BusinessRecord[]>;
  async list(kind?: RecordKind, scope = GUEST_SCOPE): Promise<BusinessRecord[]> {
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

  async get(id: string, scope = GUEST_SCOPE): Promise<BusinessRecord | undefined> {
    scopeSchema.parse(scope);
    const record = await this.database.records.get([scope, id]);
    return record?.deletedAt ? undefined : record;
  }

  /** Resolves only after both the business record and its queue mutation commit. */
  async save<K extends RecordKind>(
    kind: K,
    payload: RecordPayloads[K],
    id?: string,
    scope = GUEST_SCOPE,
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

  async remove(id: string, scope = GUEST_SCOPE): Promise<void> {
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
  async saveSelfAssessment(answers: number[], scores: Record<string, number>, scope = GUEST_SCOPE) {
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

  async countOutbox(scope = GUEST_SCOPE): Promise<number> {
    scopeSchema.parse(scope);
    return this.database.outbox.where('ownerScope').equals(scope).count();
  }

  async exportBackup(scope = GUEST_SCOPE): Promise<Backup> {
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
    reason: 'import-merge' | 'import-replace' | 'clear',
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
    scope = GUEST_SCOPE,
  ): Promise<ImportResult> {
    scopeSchema.parse(scope);
    if (mode !== 'merge' && mode !== 'replace') throw new Error('请选择合并或替换。');
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
        for (const source of backup.records) {
          const previous = byId.get(source.id);
          if (
            previous &&
            (sameContent(previous, source) ||
              existing.some((record) => sameContent(record, source)))
          ) {
            result.skipped++;
            continue;
          }
          const time = now();
          const record = businessRecordSchema.parse({
            ...source,
            id: previous ? uuid() : source.id,
            importedCopyOf: previous ? (source.importedCopyOf ?? source.id) : source.importedCopyOf,
            ownerScope: scope,
            updatedAt: time,
            serverVersion: 0,
            serverUpdatedAt: undefined,
            localRevision: 1,
            syncStatus: syncStatus(scope),
          });
          await this.database.records.add(record);
          await this.queue(record, record.deletedAt ? 'delete' : 'upsert');
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
  async clear(scope = GUEST_SCOPE): Promise<void> {
    scopeSchema.parse(scope);
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

  async listSafetyBackups(scope = GUEST_SCOPE) {
    scopeSchema.parse(scope);
    return this.database.safetyBackups
      .where('ownerScope')
      .equals(scope)
      .reverse()
      .sortBy('createdAt');
  }
}

export const repository = new Repository();
