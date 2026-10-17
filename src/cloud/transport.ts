import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { OutboxMutation } from '../domain/types';
import {
  remoteRecordSchema,
  type ApplyResult,
  type RemoteRecord,
  type RemoteTransport,
  type SnapshotPage,
} from '../sync/protocol';

export type CloudErrorCode = 'AUTH_REQUIRED' | 'NETWORK' | 'SERVER';
export class CloudTransportError extends Error {
  constructor(
    message: string,
    readonly code: CloudErrorCode,
  ) {
    super(message);
    this.name = 'CloudTransportError';
  }
}
export interface SessionBinding {
  userId: string;
  scope: string;
  isCurrent: () => boolean;
}

const applySchema = z.object({
  status: z.enum(['applied', 'conflict']),
  record: remoteRecordSchema.nullable(),
});
const snapshotSchema = z.object({
  revision: z.number().int().min(0),
  changed: z.boolean(),
  records: z.array(remoteRecordSchema).max(200),
  nextCursor: z.uuid().nullable(),
});
const deletionSchema = z.object({
  deleted_count: z.number().int().min(0),
  revision: z.number().int().min(0),
});

function mapError(error: unknown, status?: number): CloudTransportError {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const message =
    error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (
    status === 401 ||
    status === 403 ||
    ['28000', '42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(code)
  ) {
    return new CloudTransportError(
      '云端会话失效或授权被拒绝，请重新登录并检查数据库权限。本机数据仍保留。',
      'AUTH_REQUIRED',
    );
  }
  if (!navigator.onLine || /fetch|network|timeout|abort/i.test(message))
    return new CloudTransportError('网络连接中断或请求超时，本机操作仍在队列中。', 'NETWORK');
  return new CloudTransportError(
    '云端请求失败，请检查服务及数据库迁移。本机数据仍保留。',
    'SERVER',
  );
}

/** Capture a user token, rather than allowing SDK fetch to pick a changed account. */
async function boundToken(client: SupabaseClient, binding: SessionBinding): Promise<string> {
  if (!binding.isCurrent())
    throw new CloudTransportError('账号状态已经变化，旧同步已停止。', 'AUTH_REQUIRED');
  if (!navigator.onLine) throw new CloudTransportError('当前离线，变更已保存在本机。', 'NETWORK');
  try {
    const { data, error } = await client.auth.getSession();
    if (!binding.isCurrent() || error || !data.session || data.session.user.id !== binding.userId) {
      throw new CloudTransportError(
        '需要重新验证当前账号。旧同步不会写入其他账号空间。',
        'AUTH_REQUIRED',
      );
    }
    return data.session.access_token;
  } catch (error) {
    if (error instanceof CloudTransportError) throw error;
    throw mapError(error);
  }
}

/** All RPCs are bound to initial identity before and after every network request. */
export class SupabaseTransport implements RemoteTransport {
  constructor(
    private client: SupabaseClient,
    private binding: SessionBinding,
  ) {}
  private checkIdentity() {
    if (!this.binding.isCurrent())
      throw new CloudTransportError('账号状态已经变化，旧同步已停止。', 'AUTH_REQUIRED');
  }
  private checkOwner(records: RemoteRecord[]) {
    if (records.some((record) => record.owner_id !== this.binding.userId))
      throw new CloudTransportError('云端返回了其他账号的记录，已阻止读取。', 'SERVER');
  }
  async apply(mutation: OutboxMutation): Promise<ApplyResult> {
    if (
      mutation.ownerScope !== this.binding.scope ||
      mutation.payload.ownerScope !== this.binding.scope
    ) {
      throw new CloudTransportError('操作归属与当前账号不一致，已阻止上传。', 'AUTH_REQUIRED');
    }
    const token = await boundToken(this.client, this.binding);
    this.checkIdentity();
    try {
      const { data, error, status } = await this.client
        .rpc('apply_mutation', {
          p_mutation_id: mutation.mutationId,
          p_entity_id: mutation.entityId,
          p_kind: mutation.entityType,
          p_payload: mutation.payload.payload,
          p_operation: mutation.operation,
          p_base_version: mutation.baseVersion,
          p_client_created_at: mutation.payload.createdAt,
          p_client_updated_at: mutation.payload.updatedAt,
          p_imported_copy_of: mutation.payload.importedCopyOf ?? null,
        })
        .setHeader('Authorization', `Bearer ${token}`)
        .abortSignal(AbortSignal.timeout(20_000));
      this.checkIdentity();
      if (error) throw mapError(error, status);
      const parsed = applySchema.safeParse(data);
      if (!parsed.success || (parsed.data.status === 'applied' && !parsed.data.record))
        throw new CloudTransportError('云端返回了无效的操作结果，已保留本地队列。', 'SERVER');
      const result = parsed.data as ApplyResult;
      if (result.record) this.checkOwner([result.record]);
      return result;
    } catch (error) {
      if (error instanceof CloudTransportError) throw error;
      throw mapError(error);
    }
  }
  async snapshot(afterId: string | null, expectedRevision: number | null): Promise<SnapshotPage> {
    const token = await boundToken(this.client, this.binding);
    this.checkIdentity();
    try {
      const { data, error, status } = await this.client
        .rpc('sync_snapshot', {
          p_after_id: afterId,
          p_limit: 200,
          p_expected_revision: expectedRevision,
        })
        .setHeader('Authorization', `Bearer ${token}`)
        .abortSignal(AbortSignal.timeout(20_000));
      this.checkIdentity();
      if (error) throw mapError(error, status);
      const parsed = snapshotSchema.safeParse(data);
      if (!parsed.success)
        throw new CloudTransportError('云端快照结构无效，本机记录未改动。', 'SERVER');
      const result = parsed.data as SnapshotPage;
      this.checkOwner(result.records);
      return result;
    } catch (error) {
      if (error instanceof CloudTransportError) throw error;
      throw mapError(error);
    }
  }
}

/** UI must obtain explicit typed confirmation and offer a backup before calling. */
export async function requestCloudDeletion(
  client: SupabaseClient,
  expectedUserId: string,
  binding?: SessionBinding,
): Promise<{ deleted_count: number; revision: number }> {
  const session = await client.auth.getSession();
  if (session.error || !session.data.session)
    throw new CloudTransportError('删除云记录前需要重新登录。', 'AUTH_REQUIRED');
  const userId = session.data.session.user.id;
  if (userId !== expectedUserId)
    throw new CloudTransportError('账号已经变化，已取消云端删除。', 'AUTH_REQUIRED');
  const guard = binding ?? { userId: expectedUserId, scope: '', isCurrent: () => true };
  const token = await boundToken(client, guard);
  if (userId !== guard.userId)
    throw new CloudTransportError('账号已经变化，已取消云端删除。', 'AUTH_REQUIRED');
  try {
    const { data, error, status } = await client
      .rpc('request_cloud_deletion')
      .setHeader('Authorization', `Bearer ${token}`)
      .abortSignal(AbortSignal.timeout(20_000));
    if (!guard.isCurrent())
      throw new CloudTransportError('账号状态已经变化，请重新核对云端删除结果。', 'AUTH_REQUIRED');
    if (error) throw mapError(error, status);
    const parsed = deletionSchema.safeParse(data);
    if (!parsed.success)
      throw new CloudTransportError('云端删除结果结构无效，请重新核对服务状态。', 'SERVER');
    return parsed.data;
  } catch (error) {
    if (error instanceof CloudTransportError) throw error;
    throw mapError(error);
  }
}
