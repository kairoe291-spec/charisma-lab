import { z } from 'zod';

export interface CloudConfig { url: string; publishableKey: string }

/** Only public client keys are accepted. Never include rejected input in errors. */
export function validateCloudConfig(input: CloudConfig): CloudConfig {
  const rawUrl = z.string().trim().min(1).max(2048).parse(input.url);
  let endpoint: URL;
  try { endpoint = new URL(rawUrl); }
  catch { throw new Error('请输入有效的 Supabase 项目 URL。'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
  if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && local)) {
    throw new Error('云项目必须使用 HTTPS；本机 Supabase 可以使用 localhost HTTP。');
  }
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) {
    throw new Error('项目 URL 应为服务根地址，不能包含凭据、查询参数或其他路径。');
  }
  const key = z.string().trim().min(1).max(8192).parse(input.publishableKey);
  if (key.startsWith('sb_secret_')) throw new Error('不能使用管理员密钥，请提供公开 publishable key。');
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return { url: endpoint.origin, publishableKey: key };
  try {
    const segments = key.split('.');
    if (segments.length !== 3) throw new Error();
    const payload: unknown = JSON.parse(atob(segments[1].replaceAll('-', '+').replaceAll('_', '/')));
    if (typeof payload !== 'object' || payload === null || !('role' in payload) || payload.role !== 'anon') throw new Error();
    return { url: endpoint.origin, publishableKey: key };
  } catch {
    throw new Error('仅接受公开 publishable key 或 role 为 anon 的旧版公开密钥；不接受 service_role。');
  }
}

/** Include endpoint identity in all account scopes, including custom Supabase hosts. */
export async function cloudProjectId(config: CloudConfig): Promise<string> {
  const normalized = validateCloudConfig(config).url;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

export function accountScope(projectId: string, userId: string): string {
  if (!/^[a-f0-9]{16}$/.test(projectId) || !z.uuid().safeParse(userId).success) throw new Error('账号空间标识无效。');
  return `user:${projectId}:${userId}`;
}

export function environmentCloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url && !publishableKey) return null;
  return validateCloudConfig({ url: url ?? '', publishableKey: publishableKey ?? '' });
}
