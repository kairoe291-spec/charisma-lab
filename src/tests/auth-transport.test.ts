import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { SupabaseTransport, requestCloudDeletion } from '../cloud/transport';
import type { OutboxMutation } from '../domain/types';
import type { RemoteRecord } from '../sync/protocol';

const userA = '22222222-2222-4222-8222-222222222222';
const userB = '33333333-3333-4333-8333-333333333333';
const scope = `user:0123456789abcdef:${userA}`;
const now = '2026-10-13T00:00:00.000Z';
const record: RemoteRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  owner_id: userA,
  kind: 'journalEntry',
  payload: {
    title: '私人日志',
    body: '表达练习',
    tags: [],
    category: '思想笔记',
    date: '2026-10-13',
  },
  version: 1,
  created_at: now,
  updated_at: now,
  deleted_at: null,
  client_created_at: now,
  client_updated_at: now,
  imported_copy_of: null,
};
const session = (id = userA) => ({ user: { id }, access_token: `token-for-${id}` }) as Session;
function mutation(): OutboxMutation {
  return {
    mutationId: '55555555-5555-4555-8555-555555555555',
    entityType: 'journalEntry',
    entityId: record.id,
    ownerScope: scope,
    operation: 'upsert',
    baseVersion: 0,
    localRevision: 1,
    createdAt: now,
    updatedAt: now,
    retryCount: 0,
    nextRetryAt: now,
    status: 'pending',
    payload: {
      id: record.id,
      kind: 'journalEntry',
      payload: record.payload as Extract<
        OutboxMutation['payload'],
        { kind: 'journalEntry' }
      >['payload'],
      ownerScope: scope,
      createdAt: now,
      updatedAt: now,
      serverVersion: 0,
      localRevision: 1,
      syncStatus: 'pending',
    },
  };
}
function fakeClient(result: unknown, onRpc?: () => void) {
  const headers = new Map<string, string>();
  const builder = {
    setHeader: vi.fn((key: string, value: string) => {
      headers.set(key, value);
      return builder;
    }),
    abortSignal: vi.fn(async () => ({ data: result, error: null, status: 200 })),
  };
  const auth = { getSession: vi.fn(async () => ({ data: { session: session() }, error: null })) };
  const rpc = vi.fn(() => {
    onRpc?.();
    return builder;
  });
  return { client: { auth, rpc } as unknown as SupabaseClient, rpc, auth, builder, headers };
}
afterEach(() => vi.restoreAllMocks());

describe('session-bound RPC transport', () => {
  it('uses CAS parameters and a frozen initial account Authorization header', async () => {
    const fake = fakeClient({ status: 'applied', record });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    expect(await transport.apply(mutation())).toEqual({ status: 'applied', record });
    expect(fake.rpc).toHaveBeenCalledWith(
      'apply_mutation',
      expect.objectContaining({
        p_mutation_id: mutation().mutationId,
        p_entity_id: record.id,
        p_base_version: 0,
        p_operation: 'upsert',
      }),
    );
    expect(fake.headers.get('Authorization')).toBe(`Bearer token-for-${userA}`);
    expect(fake.builder.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
  });
  it('rejects operations from another scope before making a cloud request', async () => {
    const fake = fakeClient({ status: 'applied', record });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    await expect(transport.apply({ ...mutation(), ownerScope: 'guest' })).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('rejects a changed session before upload even if client now has a valid different account', async () => {
    const fake = fakeClient({ status: 'applied', record });
    fake.auth.getSession.mockResolvedValue({ data: { session: session(userB) }, error: null });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    await expect(transport.apply(mutation())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('does not accept an old response after logout and never replaces the captured bearer with account B', async () => {
    let current = true;
    const fake = fakeClient({ status: 'applied', record }, () => {
      current = false;
    });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => current,
    });
    await expect(transport.apply(mutation())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(fake.headers.get('Authorization')).toBe(`Bearer token-for-${userA}`);
  });
  it('blocks a response containing another account owner', async () => {
    const fake = fakeClient({
      revision: 1,
      changed: false,
      records: [{ ...record, owner_id: userB }],
      nextCursor: null,
    });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    await expect(transport.snapshot(null, null)).rejects.toMatchObject({ code: 'SERVER' });
  });
  it('rejects malformed private payloads before returning a snapshot to the engine', async () => {
    const fake = fakeClient({
      revision: 1,
      changed: false,
      records: [{ ...record, payload: { title: 'missing journal body' } }],
      nextCursor: null,
    });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    await expect(transport.snapshot(null, null)).rejects.toMatchObject({ code: 'SERVER' });
  });
  it('passes explicit keyset cursor and revision for paged snapshots', async () => {
    const fake = fakeClient({
      revision: 4,
      changed: false,
      records: [record],
      nextCursor: record.id,
    });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => true,
    });
    await transport.snapshot(record.id, 4);
    expect(fake.rpc).toHaveBeenCalledWith('sync_snapshot', {
      p_after_id: record.id,
      p_limit: 200,
      p_expected_revision: 4,
    });
  });
  it('treats a stale scope epoch as authorization failure without invoking RPC', async () => {
    const fake = fakeClient({ revision: 1, changed: false, records: [], nextCursor: null });
    const transport = new SupabaseTransport(fake.client, {
      userId: userA,
      scope,
      isCurrent: () => false,
    });
    await expect(transport.snapshot(null, null)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    expect(fake.auth.getSession).not.toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });
});

describe('cloud deletion identity binding', () => {
  it('rejects deletion if the current account differs from the account that confirmed it', async () => {
    const fake = fakeClient({ deleted_count: 1, revision: 2 });
    fake.auth.getSession.mockResolvedValue({ data: { session: session(userB) }, error: null });
    await expect(requestCloudDeletion(fake.client, userA)).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it('freezes the confirmed account token for the deletion RPC', async () => {
    const fake = fakeClient({ deleted_count: 3, revision: 9 });
    expect(await requestCloudDeletion(fake.client, userA)).toEqual({
      deleted_count: 3,
      revision: 9,
    });
    expect(fake.headers.get('Authorization')).toBe(`Bearer token-for-${userA}`);
    expect(fake.rpc).toHaveBeenCalledWith('request_cloud_deletion');
  });
});
