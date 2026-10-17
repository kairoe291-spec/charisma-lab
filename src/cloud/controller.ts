import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { z } from 'zod';
import {
  accountScope,
  cloudProjectId,
  environmentCloudConfig,
  validateCloudConfig,
  type CloudConfig,
} from './config';
import {
  cloudDeviceDatabase,
  type CloudDeviceDatabase,
  type IndexedDbAuthStorage,
} from './storage';

export interface CloudUser {
  id: string;
  email?: string;
}
export interface CloudState {
  scope: string;
  user: CloudUser | null;
  sessionEpoch: number;
  ready: boolean;
  config: CloudConfig | null;
  configured: boolean;
  error: string | null;
  client: SupabaseClient | null;
  authorization: 'none' | 'cached' | 'verified';
}
type ClientFactory = typeof createClient;
interface Runtime {
  client: SupabaseClient;
  storage: IndexedDbAuthStorage;
  projectId: string;
  storageKey: string;
  ticket: number;
  unsubscribe: () => void;
}
const userSchema = z.object({ id: z.uuid(), email: z.string().optional() });

function cachedUser(value: string | null): CloudUser | null {
  if (!value) return null;
  try {
    const session: unknown = JSON.parse(value);
    if (typeof session !== 'object' || session === null || !('user' in session)) return null;
    const result = userSchema.safeParse(session.user);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Auth owns identity and device tokens; business data remains in Repository. */
export class CloudController {
  private state: CloudState = {
    scope: 'guest',
    user: null,
    sessionEpoch: 0,
    ready: false,
    config: null,
    configured: false,
    error: null,
    client: null,
    authorization: 'none',
  };
  private listeners = new Set<() => void>();
  private lifecycle = 0;
  private runtime: Runtime | null = null;
  private channel: BroadcastChannel | null = null;

  constructor(
    private database: CloudDeviceDatabase = cloudDeviceDatabase,
    private clientFactory: ClientFactory = createClient,
  ) {}
  getSnapshot = (): CloudState => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<CloudState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  private separateIdentity(patch: Partial<CloudState> = {}) {
    this.publish({
      scope: 'guest',
      user: null,
      authorization: 'none',
      sessionEpoch: this.state.sessionEpoch + 1,
      ...patch,
    });
  }
  private isCurrent(runtime: Runtime) {
    return this.runtime === runtime && this.lifecycle === runtime.ticket;
  }
  private fail(message: string) {
    this.publish({ error: message });
    return new Error(message);
  }

  initialize = async (): Promise<void> => {
    const ticket = ++this.lifecycle;
    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('charisma-lab-cloud-identity');
      this.channel.onmessage = (event) => {
        if (
          event.data?.type === 'configuration' ||
          (event.data?.type === 'signout' && event.data?.projectId === this.runtime?.projectId)
        ) {
          // Synchronously isolate before asynchronous database/session restoration.
          this.separateIdentity({ ready: false });
          void this.initialize();
        }
      };
    }
    try {
      const stored = await this.database.getConfig();
      if (ticket !== this.lifecycle) return;
      const config = stored ? validateCloudConfig(stored) : environmentCloudConfig();
      if (!config) {
        await this.releaseClient();
        if (ticket === this.lifecycle)
          this.separateIdentity({
            ready: true,
            config: null,
            configured: false,
            client: null,
            error: null,
          });
        return;
      }
      await this.install(config, ticket);
    } catch {
      if (ticket === this.lifecycle)
        this.separateIdentity({
          ready: true,
          configured: false,
          client: null,
          error: '无法读取有效云配置；可以继续使用本地模式，请检查公开配置与浏览器存储权限。',
        });
    }
  };

  private async releaseClient() {
    const previous = this.runtime;
    this.runtime = null;
    if (previous) {
      previous.unsubscribe();
      await previous.client.auth.dispose();
    }
  }

  private async install(config: CloudConfig, ticket: number) {
    await this.releaseClient();
    if (ticket !== this.lifecycle) return;
    const projectId = await cloudProjectId(config);
    const storage = await this.database.storage(projectId);
    const storageKey = `charisma-auth-${projectId}`;
    const localUser = cachedUser(await storage.getItem(storageKey));
    if (ticket !== this.lifecycle) return;
    const client = this.clientFactory(config.url, config.publishableKey, {
      auth: {
        storage,
        storageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) }),
      },
    });
    const runtime: Runtime = {
      client,
      storage,
      storageKey,
      projectId,
      ticket,
      unsubscribe: () => {},
    };
    this.runtime = runtime;
    this.publish({ config, configured: true, client, ready: true, error: null });
    this.acceptUser(runtime, localUser, 'cached');
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Never await SDK methods inside this callback; SDK auth locks can deadlock.
      this.authChanged(runtime, event, session);
    });
    runtime.unsubscribe = () => data.subscription.unsubscribe();
    void client.auth
      .getSession()
      .then(({ data: result, error }) => {
        if (!this.isCurrent(runtime)) return;
        if (error) {
          this.publish({ error: '会话暂时无法验证；本机已有记录仍可使用，请联网后重新验证。' });
          return;
        }
        this.authChanged(runtime, 'INITIAL_SESSION', result.session);
        if (result.session && navigator.onLine) void this.verifySession(runtime);
      })
      .catch(() => {
        if (this.isCurrent(runtime))
          this.publish({ error: '会话暂时无法验证；本机已有记录仍可使用。' });
      });
  }

  private acceptUser(
    runtime: Runtime,
    user: CloudUser | null,
    authorization: CloudState['authorization'],
  ) {
    if (!this.isCurrent(runtime)) return;
    const scope = user ? accountScope(runtime.projectId, user.id) : 'guest';
    const changed = scope !== this.state.scope;
    this.publish({
      user,
      scope,
      authorization: user ? authorization : 'none',
      sessionEpoch: this.state.sessionEpoch + (changed ? 1 : 0),
    });
  }

  private authChanged(runtime: Runtime, event: AuthChangeEvent, session: Session | null) {
    if (!this.isCurrent(runtime)) return;
    if (event === 'SIGNED_OUT') {
      this.separateIdentity({ error: null });
      // Invalidate old refresh writes even when another tab caused the logout.
      void this.database
        .revoke(runtime.projectId)
        .then(() => {
          if (this.isCurrent(runtime)) {
            ++this.lifecycle;
            void this.install(this.state.config!, this.lifecycle);
          }
        })
        .catch(() => {
          if (this.isCurrent(runtime))
            this.publish({ error: '账号已退出，但浏览器未能清除会话存储，请检查存储权限。' });
        });
      return;
    }
    if (!session) {
      if (event === 'INITIAL_SESSION' && this.state.user && !navigator.onLine) return;
      this.acceptUser(runtime, null, 'none');
      return;
    }
    const user = userSchema.safeParse(session.user);
    if (!user.success) {
      this.separateIdentity({ error: '云端账号标识无效，请重新登录。' });
      return;
    }
    this.acceptUser(runtime, user.data, event === 'INITIAL_SESSION' ? 'cached' : 'verified');
  }

  private async verifySession(runtime: Runtime) {
    const { data, error } = await runtime.client.auth.getUser();
    if (!this.isCurrent(runtime)) return;
    if (error) {
      this.publish({
        authorization: this.state.user ? 'cached' : 'none',
        error: '云端授权尚未验证；本机数据保留。请联网或重新登录。',
      });
      return;
    }
    const user = userSchema.safeParse(data.user);
    if (user.success) this.acceptUser(runtime, user.data, 'verified');
  }

  configure = async (input: CloudConfig): Promise<void> => {
    if (!this.state.ready) throw this.fail('云配置正在恢复，请稍后重试。');
    if (this.state.user) throw this.fail('请先退出当前账号，再更换云项目配置。');
    const config = validateCloudConfig(input);
    await this.database.saveConfig(config);
    this.channel?.postMessage({ type: 'configuration' });
    this.separateIdentity({ ready: false });
    const ticket = ++this.lifecycle;
    await this.install(config, ticket);
  };

  private requireRuntime(): Runtime {
    if (!this.runtime) throw this.fail('尚未配置 Supabase。你可以继续使用完整本地模式。');
    if (!navigator.onLine) throw this.fail('离线时无法完成新登录；请联网后重试。');
    return this.runtime;
  }

  sendOtp = async (email: string): Promise<void> => {
    const runtime = this.requireRuntime();
    const valid = z.email().safeParse(email.trim());
    if (!valid.success) throw this.fail('请输入有效的邮箱地址。');
    const { error } = await runtime.client.auth.signInWithOtp({
      email: valid.data,
      options: { shouldCreateUser: true },
    });
    if (!this.isCurrent(runtime)) throw new Error('账号状态已经变化，请重新开始登录。');
    if (error) throw this.fail('验证码未能发送，请检查邮箱、认证邮件配置或稍后重试。');
    this.publish({ error: null });
  };

  verifyOtp = async (email: string, token: string): Promise<void> => {
    const runtime = this.requireRuntime();
    const validEmail = z.email().safeParse(email.trim());
    if (!validEmail.success || !/^\d{6,10}$/.test(token.trim()))
      throw this.fail('请输入有效邮箱和邮件中的数字验证码。');
    const { data, error } = await runtime.client.auth.verifyOtp({
      email: validEmail.data,
      token: token.trim(),
      type: 'email',
    });
    if (!this.isCurrent(runtime)) throw new Error('账号状态已经变化，请重新开始登录。');
    if (error || !data.session) throw this.fail('验证码无效或已过期，请重新发送后尝试。');
    this.authChanged(runtime, 'SIGNED_IN', data.session);
    this.publish({ error: null });
  };

  signOut = async (): Promise<void> => {
    const previous = this.runtime;
    const config = this.state.config;
    // Scope changes before any await, so old requests cannot mutate a new identity.
    const ticket = ++this.lifecycle;
    this.separateIdentity({ ready: false, client: null, error: null });
    if (!previous || !config) {
      this.publish({ ready: true });
      return;
    }
    // SDK local logout is best effort. Atomic storage revocation is authoritative.
    const remoteLogout = previous.client.auth
      .signOut({ scope: 'local' })
      .catch(() => ({ error: true }));
    try {
      await this.database.revoke(previous.projectId);
      this.channel?.postMessage({ type: 'signout', projectId: previous.projectId });
      await this.install(config, ticket);
      void remoteLogout.then((result) => {
        if (ticket === this.lifecycle && result.error)
          this.publish({ error: '已退出此设备。网络未能确认远端会话撤销；本机账号已隔离。' });
      });
    } catch {
      await this.releaseClient();
      this.publish({
        ready: true,
        error: '已隔离当前账号，但清除会话存储失败。请检查浏览器存储权限后重试。',
      });
      throw new Error('本机会话清除失败，请检查浏览器存储权限。');
    }
  };

  dispose = () => {
    ++this.lifecycle;
    this.channel?.close();
    this.channel = null;
    void this.releaseClient();
  };
}
