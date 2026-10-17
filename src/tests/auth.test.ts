import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js';
import { accountScope, cloudProjectId, validateCloudConfig } from '../cloud/config';
import { CloudDeviceDatabase } from '../cloud/storage';
import { CloudController } from '../cloud/controller';

const userId = '22222222-2222-4222-8222-222222222222';
const config = {
  url: 'https://first.supabase.co',
  publishableKey: 'sb_publishable_test_public_only',
};
const session = {
  user: { id: userId, email: 'learner@example.com' },
  access_token: 'test-token',
  refresh_token: 'test-refresh',
  expires_at: 1,
  token_type: 'bearer',
  expires_in: 3600,
} as Session;
let database: CloudDeviceDatabase;
const controllers: CloudController[] = [];

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  database = new CloudDeviceDatabase(`auth-test-${crypto.randomUUID()}`);
});
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  await database.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function fakeClient(currentSession: Session | null = null) {
  const callbacks: Array<(event: AuthChangeEvent, session: Session | null) => void> = [];
  const auth = {
    getSession: vi.fn(async () => ({ data: { session: currentSession }, error: null })),
    getUser: vi.fn(async () => ({ data: { user: currentSession?.user ?? null }, error: null })),
    onAuthStateChange: vi.fn(
      (callback: (event: AuthChangeEvent, session: Session | null) => void) => {
        callbacks.push(callback);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    ),
    signInWithOtp: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({ data: { session }, error: null })),
    signOut: vi.fn(async () => ({ error: new Error('network unavailable') })),
    dispose: vi.fn(async () => {}),
  };
  return { auth, callbacks, client: { auth } as unknown as SupabaseClient };
}

describe('public cloud configuration', () => {
  it('normalizes root URL and accepts public keys, including legacy anon JWT', () => {
    expect(validateCloudConfig({ ...config, url: 'https://FIRST.supabase.co/' }).url).toBe(
      config.url,
    );
    const key = `header.${btoa(JSON.stringify({ role: 'anon' }))}.signature`;
    expect(validateCloudConfig({ ...config, publishableKey: key }).publishableKey).toBe(key);
    expect(validateCloudConfig({ ...config, url: 'http://127.0.0.1:54321/' }).url).toBe(
      'http://127.0.0.1:54321',
    );
  });
  it('rejects secrets and service_role without echoing the rejected value', () => {
    const secret = 'sb_secret_do_not_print_this';
    expect(() => validateCloudConfig({ ...config, publishableKey: secret })).toThrow('管理员');
    try {
      validateCloudConfig({ ...config, publishableKey: secret });
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
    const serviceKey = `header.${btoa(JSON.stringify({ role: 'service_role' }))}.signature`;
    expect(() => validateCloudConfig({ ...config, publishableKey: serviceKey })).toThrow('公开');
    expect(() => validateCloudConfig({ ...config, publishableKey: 'not-a-public-key' })).toThrow(
      '公开',
    );
  });
  it('rejects insecure remote endpoints and URLs containing credentials or paths', () => {
    for (const url of [
      'http://example.com',
      'https://user:password@example.com',
      'https://example.com/auth',
      'https://example.com?token=x',
      'https://example.com#token=x',
    ]) {
      expect(() => validateCloudConfig({ ...config, url })).toThrow();
    }
  });
  it('separates the same account UUID across projects while normalizing equivalent URLs', async () => {
    const first = await cloudProjectId(config);
    expect(await cloudProjectId({ ...config, url: `${config.url}/` })).toBe(first);
    const second = await cloudProjectId({ ...config, url: 'https://second.supabase.co' });
    expect(accountScope(first, userId)).not.toBe(accountScope(second, userId));
    expect(accountScope(first, userId).length).toBeLessThan(100);
  });
});

describe('IndexedDB token storage', () => {
  it('keeps project token namespaces separate and stores configuration outside tokens', async () => {
    const first = await database.storage('first');
    const second = await database.storage('second');
    await first.setItem('session', 'first-private-session');
    await second.setItem('session', 'second-private-session');
    await database.saveConfig(config);
    expect(await first.getItem('session')).toBe('first-private-session');
    expect(await second.getItem('session')).toBe('second-private-session');
    expect(await database.getConfig()).toEqual(config);
    expect(await database.settings.toArray()).toEqual([{ key: 'active', config }]);
  });
  it('atomically revokes tokens and rejects stale refresh writes after logout', async () => {
    const beforeLogout = await database.storage('project');
    await beforeLogout.setItem('session', 'old-token');
    await database.revoke('project');
    await beforeLogout.setItem('session', 'late-network-refresh');
    const afterLogout = await database.storage('project');
    expect(await afterLogout.getItem('session')).toBeNull();
    expect(await beforeLogout.getItem('session')).toBeNull();
    expect(await beforeLogout.isCurrent()).toBe(false);
    await afterLogout.setItem('session', 'new-login');
    await beforeLogout.removeItem('session');
    expect(await afterLogout.getItem('session')).toBe('new-login');
  });
  it('revoking one project does not remove another project account session', async () => {
    const first = await database.storage('first');
    const second = await database.storage('second');
    await first.setItem('session', 'a');
    await second.setItem('session', 'b');
    await database.revoke('first');
    expect(await second.getItem('session')).toBe('b');
  });
});

describe('account lifecycle', () => {
  it('runs without configuration or a cloud client', async () => {
    const factory = vi.fn();
    const controller = new CloudController(database, factory);
    controllers.push(controller);
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({
      scope: 'guest',
      configured: false,
      ready: true,
      user: null,
    });
    expect(factory).not.toHaveBeenCalled();
  });
  it('restores cached account data offline while marking authorization as unverified', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const project = await cloudProjectId(config);
    await database.saveConfig(config);
    const storage = await database.storage(project);
    await storage.setItem(`charisma-auth-${project}`, JSON.stringify(session));
    const fake = fakeClient(session);
    const controller = new CloudController(
      database,
      (() => fake.client) as typeof import('@supabase/supabase-js').createClient,
    );
    controllers.push(controller);
    await controller.initialize();
    expect(controller.getSnapshot()).toMatchObject({
      scope: accountScope(project, userId),
      user: { id: userId },
      authorization: 'cached',
    });
    expect(fake.auth.getUser).not.toHaveBeenCalled();
    await expect(controller.sendOtp('learner@example.com')).rejects.toThrow('离线');
  });
  it('isolates identity immediately on logout even when the network revocation fails', async () => {
    await database.saveConfig(config);
    const fake = fakeClient(session);
    fake.auth.getSession
      .mockResolvedValueOnce({ data: { session }, error: null })
      .mockResolvedValue({ data: { session: null }, error: null });
    const controller = new CloudController(
      database,
      (() => fake.client) as typeof import('@supabase/supabase-js').createClient,
    );
    controllers.push(controller);
    await controller.initialize();
    fake.callbacks[0]('SIGNED_IN', session);
    const epoch = controller.getSnapshot().sessionEpoch;
    const pending = controller.signOut();
    expect(controller.getSnapshot()).toMatchObject({ scope: 'guest', user: null });
    expect(controller.getSnapshot().sessionEpoch).toBeGreaterThan(epoch);
    // A queued callback from the old SDK must not restore the signed-out identity.
    fake.callbacks[0]('SIGNED_IN', session);
    expect(controller.getSnapshot().user).toBeNull();
    await pending;
    expect(controller.getSnapshot().user).toBeNull();
  });
  it('requires signing out before changing an active account project', async () => {
    await database.saveConfig(config);
    const fake = fakeClient(session);
    const controller = new CloudController(
      database,
      (() => fake.client) as typeof import('@supabase/supabase-js').createClient,
    );
    controllers.push(controller);
    await controller.initialize();
    fake.callbacks[0]('SIGNED_IN', session);
    await expect(
      controller.configure({ ...config, url: 'https://second.supabase.co' }),
    ).rejects.toThrow('先退出');
    expect(await database.getConfig()).toEqual(config);
  });
});
