import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// Real migration/RLS/RPC, with a local HTTP adapter and test-only email verifier.
// This does not replace a hosted Supabase/real-email/device acceptance test.
const origin = 'https://p1-test.supabase.co';
const users = [
  { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test' },
  { id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test' },
];
let database: PGlite;
let sqlTail: Promise<unknown> = Promise.resolve();
let failNext = false;
let dropCommitted = false;
function userObject(user: typeof users[number]) { return { ...user, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [], created_at: new Date().toISOString() }; }
function session(user: typeof users[number]) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const access_token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, role: 'authenticated', aud: 'authenticated', exp: expires, iss: `${origin}/auth/v1` })).toString('base64url'), 'test-signature'].join('.');
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: expires, refresh_token: user.id, user: userObject(user) };
}
async function rpc(name: string, body: Record<string, unknown>, userId: string) {
  const task = sqlTail.catch(() => {}).then(async () => {
    await database.exec('SET ROLE authenticated');
    try {
      await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
      let result;
      if (name === 'apply_mutation') result = await database.query<{ data: unknown }>('SELECT public.apply_mutation($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::integer,$7::timestamptz,$8::timestamptz,$9::uuid) AS data', [body.p_mutation_id, body.p_entity_id, body.p_kind, JSON.stringify(body.p_payload), body.p_operation, body.p_base_version, body.p_client_created_at, body.p_client_updated_at, body.p_imported_copy_of]);
      else if (name === 'sync_snapshot') result = await database.query<{ data: unknown }>('SELECT public.sync_snapshot($1::uuid,$2::integer,$3::bigint) AS data', [body.p_after_id, body.p_limit, body.p_expected_revision]);
      else if (name === 'request_cloud_deletion') result = await database.query<{ data: unknown }>('SELECT public.request_cloud_deletion() AS data');
      else throw new Error('Unexpected RPC');
      return result.rows[0].data;
    } finally { await database.exec('RESET ROLE'); }
  });
  sqlTail = task;
  return task;
}
async function routeCloud(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
  const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const body = request.postData() ? JSON.parse(request.postData()!) as Record<string, unknown> : {};
  if (url.pathname.endsWith('/otp')) return reply({});
  if (url.pathname.endsWith('/verify')) {
    const user = users.find(u => u.email === body.email);
    return user && body.token === '123456' ? reply(session(user)) : reply({ message: 'Invalid test OTP' }, 400);
  }
  if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204, headers });
  let user;
  try { const jwt = request.headers().authorization?.split(' ')[1]; const sub = JSON.parse(Buffer.from(jwt!.split('.')[1], 'base64url').toString()).sub; user = users.find(u => u.id === sub); } catch { /* unauthenticated */ }
  if (!user) return reply({ message: 'unauthenticated' }, 401);
  if (url.pathname.endsWith('/user')) return reply(userObject(user));
  if (url.pathname.includes('/rpc/')) {
    if (failNext) { failNext = false; return reply({ message: 'Injected temporary failure' }, 503); }
    try {
      const name = url.pathname.split('/').at(-1)!;
      const result = await rpc(name, body, user.id);
      if (dropCommitted && name === 'apply_mutation') { dropCommitted = false; return route.abort('connectionreset'); }
      return reply(result);
    } catch (error) { return reply({ code: (error as { code?: string }).code, message: error instanceof Error ? error.message : 'SQL failed' }, 400); }
  }
  return reply({ message: 'Unexpected request' }, 404);
}
async function init(context: BrowserContext) {
  await context.route(`${origin}/**`, routeCloud);
  const page = await context.newPage();
  await page.goto('/#/settings');
  await page.getByRole('dialog').getByLabel('如何称呼你').fill('云同步测试');
  await page.getByRole('button', { name: '开启我的成长计划' }).click();
  await page.getByLabel('Supabase Project URL', { exact: true }).fill(origin);
  await page.getByLabel('Supabase 公开密钥', { exact: true }).fill('sb_publishable_test_public_configuration');
  await page.getByRole('button', { name: '保存公开配置', exact: true }).click();
  await expect(page.getByLabel('登录邮箱', { exact: true })).toBeVisible();
  return page;
}
async function login(page: Page, email: string, migrate = false) {
  await page.goto('/#/settings');
  await page.getByLabel('登录邮箱', { exact: true }).fill(email);
  await page.getByRole('button', { name: '发送邮箱验证码', exact: true }).click();
  await page.getByLabel('邮箱验证码', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '验证并登录', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '登录后的游客数据选择' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: migrate ? '将游客数据合并到当前账号' : '保留游客数据但不合并', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function sync(page: Page) {
  await page.goto('/#/settings');
  await expect(page.getByRole('button', { name: '立即同步 / 重试', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '立即同步 / 重试', exact: true }).click();
  await expect(page.getByRole('button', { name: '立即同步 / 重试', exact: true })).toBeEnabled();
}
async function journal(page: Page, title: string, body: string) {
  await page.goto('/#/journal');
  await page.getByRole('button', { name: '新建日志', exact: true }).click();
  await page.getByLabel('日志标题', { exact: true }).fill(title);
  await page.getByLabel('日志正文', { exact: true }).fill(body);
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  return page.url();
}
test.beforeAll(async () => {
  test.setTimeout(120_000);
  database = new PGlite();
  await database.exec("CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$; GRANT USAGE ON SCHEMA auth TO anon,authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;");
  for (const user of users) await database.query('INSERT INTO auth.users(id) VALUES ($1)', [user.id]);
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) await database.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
});
test.afterAll(async () => { await database?.close(); });

test('P1 两设备、冲突保护、游客迁移和账号隔离（真实 SQL，测试邮箱服务）', async ({ browser }) => {
  test.setTimeout(120_000);
  const a = await browser.newContext(); const b = await browser.newContext();
  const pageA = await init(a); const pageB = await init(b);
  try {
    await login(pageA, users[0].email, true);
    const entryUrl = await journal(pageA, 'P1 私人记录', '设备 A 初始内容');
    await sync(pageA);
    await expect(pageA.locator('.status-strip')).toContainText('云端同步完成');
    await login(pageB, users[0].email);
    await sync(pageB);
    await pageB.goto(entryUrl);
    await expect(pageB.getByLabel('日志正文', { exact: true })).toHaveValue('设备 A 初始内容');
    await a.setOffline(true);
    await pageA.goto(entryUrl);
    await pageA.getByLabel('日志正文', { exact: true }).fill('设备 A 离线修改，需要保留');
    await expect(pageA.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
    await pageB.getByLabel('日志正文', { exact: true }).fill('设备 B 在线修改，也要保留');
    await expect(pageB.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
    await sync(pageB);
    await a.setOffline(false);
    await sync(pageA);
    await pageA.getByRole('button', { name: '对比两个版本', exact: true }).click();
    const conflict = pageA.getByRole('dialog', { name: '对比与处理版本冲突' });
    await expect(conflict).toContainText('设备 A 离线修改，需要保留');
    await expect(conflict).toContainText('设备 B 在线修改，也要保留');
    await conflict.getByRole('button', { name: '对比后手动合并', exact: true }).click();
    await conflict.getByLabel('手动合并内容', { exact: true }).fill('P1 私人记录\n\nA 与 B 合并后的内容');
    await conflict.getByRole('button', { name: '保存合并版本', exact: true }).click();
    await expect(conflict).not.toBeVisible();
    await sync(pageA); await sync(pageB);
    await pageB.goto(entryUrl);
    await expect(pageB.getByLabel('日志正文', { exact: true })).toHaveValue('A 与 B 合并后的内容');
    await pageA.goto('/#/settings');
    await pageA.getByRole('button', { name: '退出账号', exact: true }).click();
    await expect(pageA.getByLabel('登录邮箱', { exact: true })).toBeVisible();
    await login(pageA, users[1].email);
    await pageA.goto('/#/journal');
    await expect(pageA.getByText('P1 私人记录', { exact: true })).toHaveCount(0);
    await pageA.reload();
    await expect(pageA.getByText('P1 私人记录', { exact: true })).toHaveCount(0);
    await pageA.screenshot({ path: 'test-results/p1-account-isolation.png', fullPage: true });
  } finally { await a.close(); await b.close(); }
});

test('P1 响应丢失和服务端错误后手动重试不重复、不丢记录', async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext(); const page = await init(context);
  try {
    await login(page, users[0].email);
    await sync(page);
    dropCommitted = true;
    const url = await journal(page, '超时安全测试', '提交后响应丢失也不应重复');
    await page.waitForTimeout(900);
    await sync(page);
    failNext = true;
    await page.goto(url);
    await page.getByLabel('日志正文', { exact: true }).fill('服务器错误后仍保存在本机');
    await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
    await page.waitForTimeout(900);
    await sync(page);
    await expect(page.locator('.status-strip')).toContainText('云端同步完成');
    const rows = await database.query<{ total: number }>("SELECT count(*)::int AS total FROM public.user_records WHERE payload->>'title'='超时安全测试' AND deleted_at IS NULL");
    expect(rows.rows[0].total).toBe(1);
    await page.goto(url); await page.reload();
    await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue('服务器错误后仍保存在本机');
  } finally { await context.close(); }
});
