import { z } from 'zod';
import { businessRecordSchema, recordKinds } from '../domain/validation';
import type { BusinessRecord, OutboxMutation, RecordKind, RecordPayloads } from '../domain/types';

export interface RemoteRecord {
  id: string;
  owner_id: string;
  kind: RecordKind;
  payload: RecordPayloads[RecordKind];
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  client_created_at: string | null;
  client_updated_at: string | null;
  imported_copy_of: string | null;
}
export interface ApplyResult { status: 'applied' | 'conflict'; record: RemoteRecord | null }
export interface SnapshotPage { revision: number; changed: boolean; records: RemoteRecord[]; nextCursor: string | null }
export interface RemoteTransport {
  apply(mutation: OutboxMutation): Promise<ApplyResult>;
  snapshot(afterId: string | null, expectedRevision: number | null): Promise<SnapshotPage>;
}
export interface SyncState {
  running: boolean;
  pending: number;
  conflicts: number;
  lastSuccessAt?: string;
  error?: string;
  authRequired: boolean;
}
const timestamp = z.iso.datetime({ offset: true });
export const remoteRecordSchema = z.object({
  id: z.uuid(), owner_id: z.uuid(), kind: z.enum(recordKinds), payload: z.unknown(),
  version: z.number().int().min(1), created_at: timestamp, updated_at: timestamp,
  deleted_at: timestamp.nullable(), client_created_at: timestamp.nullable(),
  client_updated_at: timestamp.nullable(), imported_copy_of: z.uuid().nullable(),
}).superRefine((record, ctx) => {
  const result = businessRecordSchema.safeParse({
    id: record.id, kind: record.kind, payload: record.payload, ownerScope: 'guest',
    createdAt: record.client_created_at ?? record.created_at,
    updatedAt: record.client_updated_at ?? record.updated_at,
    serverVersion: record.version, localRevision: 1, syncStatus: 'synced',
    deletedAt: record.deleted_at ?? undefined, importedCopyOf: record.imported_copy_of ?? undefined,
  });
  if (!result.success) ctx.addIssue({ code: 'custom', path: ['payload'], message: '云端业务记录结构无效' });
});
export function fromRemote(value: RemoteRecord, scope: string, expectedUserId: string, localRevision = 1): BusinessRecord {
  const remote = remoteRecordSchema.parse(value);
  if (remote.owner_id !== expectedUserId) throw new Error('云端返回了其他账号的数据，已阻止读取。');
  return businessRecordSchema.parse({
    id: remote.id, kind: remote.kind, payload: remote.payload, ownerScope: scope,
    createdAt: remote.client_created_at ?? remote.created_at,
    updatedAt: remote.client_updated_at ?? remote.updated_at,
    serverUpdatedAt: remote.updated_at, serverVersion: remote.version, localRevision,
    deletedAt: remote.deleted_at ?? undefined, importedCopyOf: remote.imported_copy_of ?? undefined,
    syncStatus: 'synced',
  });
}
