// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entityId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const journal = (body = '真实保存的私人日志') => ({ title: 'SQL 验证', body, tags: ['复盘'], category: '每日成长', date: '2026-10-13' });
const clientDate = '2099-10-13T01:00:00Z';

interface RemoteRecord {
  id: string;
  owner_id: string;
  kind: string;
  payload: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  client_created_at: string | null;
  client_updated_at: string | null;
  imported_copy_of: string | null;
}
interface MutationResult { status: 'applied' | 'conflict'; record: RemoteRecord | null }
interface Snapshot { revision: number; changed: boolean; records: RemoteRecord[]; nextCursor: string | null }
let database: PGlite;

async function authenticate(id: string | null, role: 'authenticated' | 'anon' = 'authenticated') {
  await database.exec('RESET ROLE');
  await database.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id ?? '']);
  await database.exec(`SET ROLE ${role}`);
}
async function administrator() { await database.exec('RESET ROLE'); }
async function apply(options: {
  id?: string; mutationId?: string; kind?: string; payload?: unknown; operation?: string;
  baseVersion?: number; copyOf?: string | null; clientCreated?: string | null; clientUpdated?: string | null;
} = {}): Promise<MutationResult> {
  const result = await database.query<{ result: MutationResult }>(
    `SELECT public.apply_mutation($1::uuid,$2::uuid,$3::text,$4::jsonb,$5::text,$6::integer,$7::timestamptz,$8::timestamptz,$9::uuid) AS result`,
    [options.mutationId ?? randomUUID(), options.id ?? entityId(1), options.kind ?? 'journalEntry',
      JSON.stringify(options.payload ?? journal()), options.operation ?? 'upsert', options.baseVersion ?? 0,
      options.clientCreated === undefined ? clientDate : options.clientCreated,
      options.clientUpdated === undefined ? clientDate : options.clientUpdated, options.copyOf ?? null],
  );
  return result.rows[0].result;
}
async function snapshot(after: string | null = null, limit = 200, revision: number | null = null): Promise<Snapshot> {
  const result = await database.query<{ result: Snapshot }>(
    'SELECT public.sync_snapshot($1::uuid,$2::integer,$3::bigint) AS result', [after, limit, revision],
  );
  return result.rows[0].result;
}
async function deleteCloud() {
  const result = await database.query<{ result: { deleted_count: number; revision: number } }>('SELECT public.request_cloud_deletion() AS result');
  return result.rows[0].result;
}

describe('真实 PostgreSQL 引擎中的 P1 迁移、RLS、CAS 和幂等', () => {
  beforeAll(async () => {
    database = new PGlite();
    await database.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
      INSERT INTO auth.users VALUES ('${ACCOUNT_A}'), ('${ACCOUNT_B}');
    `);
    const migration = await readFile(new URL('../../supabase/migrations/202610130001_reliable_sync.sql', import.meta.url), 'utf8');
    await database.exec(migration);
  }, 30_000);
  beforeEach(async () => {
    await administrator();
    await database.exec('TRUNCATE public.user_records, charisma_private.mutation_receipts, charisma_private.sync_revisions');
    await authenticate(ACCOUNT_A);
  });
  afterEach(async () => {
    await administrator();
    await database.exec('REVOKE INSERT, UPDATE, DELETE ON public.user_records FROM authenticated');
  });
  afterAll(async () => { await database?.close(); });

  it('创建和更新只能使用可信服务端版本、时间；客户端日期可空且不裁决冲突', async () => {
    const created = await apply();
    expect(created.status).toBe('applied');
    expect(created.record).toMatchObject({ owner_id: ACCOUNT_A, id: entityId(1), version: 1, client_created_at: '2099-10-13T01:00:00+00:00' });
    expect(created.record!.created_at).not.toEqual(created.record!.client_created_at);
    const updated = await apply({ baseVersion: 1, payload: journal('新的本机内容'), clientUpdated: null });
    expect(updated.record).toMatchObject({ version: 2, client_updated_at: null, payload: journal('新的本机内容') });
    expect(updated.record!.created_at).toBe(created.record!.created_at);
    expect((await snapshot()).revision).toBe(2);
  });

  it('重发相同 mutation 只提交一次，JSON 键顺序改变仍是同一请求', async () => {
    const mutationId = randomUUID();
    const first = await apply({ mutationId });
    const samePayload = { date: '2026-10-13', category: '每日成长', tags: ['复盘'], body: '真实保存的私人日志', title: 'SQL 验证' };
    const second = await apply({ mutationId, payload: samePayload });
    expect(second).toEqual(first);
    expect((await snapshot()).revision).toBe(1);
    await administrator();
    expect((await database.query<{ count: number }>('SELECT count(*)::integer AS count FROM public.user_records')).rows[0].count).toBe(1);
    expect((await database.query<{ count: number }>('SELECT count(*)::integer AS count FROM charisma_private.mutation_receipts')).rows[0].count).toBe(1);
  });

  it('同一 mutationId 携带不同内容被拒绝，已有数据和版本保持不变', async () => {
    const mutationId = randomUUID();
    await apply({ mutationId });
    await expect(apply({ mutationId, payload: journal('试图变更已发送操作') })).rejects.toMatchObject({ code: '22023' });
    expect((await snapshot()).records[0]).toMatchObject({ version: 1, payload: journal() });
  });

  it('CAS 拒绝旧版本，冲突凭证重试返回原冲突，不静默覆盖日志', async () => {
    await apply();
    await apply({ baseVersion: 1, payload: journal('设备 B 的在线修改') });
    const mutationId = randomUUID();
    const conflicting = await apply({ mutationId, baseVersion: 1, payload: journal('设备 A 的离线修改') });
    expect(conflicting).toMatchObject({ status: 'conflict', record: { version: 2, payload: journal('设备 B 的在线修改') } });
    await apply({ baseVersion: 2, payload: journal('之后另一份修改') });
    expect(await apply({ mutationId, baseVersion: 1, payload: journal('设备 A 的离线修改') })).toEqual(conflicting);
    expect((await snapshot()).records[0].payload).toEqual(journal('之后另一份修改'));
  });

  it('缺失记录的非零基础版本返回 nullable 冲突，不创建新记录', async () => {
    expect(await apply({ baseVersion: 7 })).toEqual({ status: 'conflict', record: null });
    expect((await snapshot()).records).toEqual([]);
    expect((await snapshot()).revision).toBe(0);
  });

  it('删除创建 Tombstone；匹配最新版本也不能复活同一个 ID', async () => {
    await apply();
    const removed = await apply({ operation: 'delete', baseVersion: 1 });
    expect(removed.record).toMatchObject({ version: 2 });
    expect(removed.record!.deleted_at).not.toBeNull();
    const resurrection = await apply({ baseVersion: 2, payload: journal('被旧设备重新提交的内容') });
    expect(resurrection.status).toBe('conflict');
    expect(resurrection.record!.deleted_at).toBe(removed.record!.deleted_at);
    expect((await snapshot()).revision).toBe(2);
    const repeatedDelete = await apply({ operation: 'delete', baseVersion: 2 });
    expect(repeatedDelete.record!.version).toBe(2);
    expect((await snapshot()).revision).toBe(2);
    const copy = await apply({ id: entityId(2), copyOf: entityId(1), payload: journal('用户明确保存的新副本') });
    expect(copy.record).toMatchObject({ imported_copy_of: entityId(1), deleted_at: null });
  });

  it('尚未上传的本地删除仍创建 Tombstone，防止旧创建操作使记录复活', async () => {
    expect((await apply({ operation: 'delete' })).record!.deleted_at).not.toBeNull();
    expect((await apply()).status).toBe('conflict');
  });

  it('记录 kind 和备份副本标识不能在 CAS 更新时改写', async () => {
    await apply();
    await expect(apply({ baseVersion: 1, kind: 'appSettings', payload: { theme: 'warm' } })).rejects.toMatchObject({ code: '22023' });
    await expect(apply({ baseVersion: 1, copyOf: entityId(2) })).rejects.toMatchObject({ code: '22023' });
    expect((await snapshot()).revision).toBe(1);
  });

  it('同样的记录 UUID 在两个账号中隔离；SELECT 与快照只返回当前账号', async () => {
    await apply({ payload: journal('A 私人内容') });
    await authenticate(ACCOUNT_B);
    expect((await snapshot()).records).toHaveLength(0);
    expect((await database.query('SELECT * FROM public.user_records WHERE owner_id = $1', [ACCOUNT_A])).rows).toEqual([]);
    await apply({ payload: journal('B 私人内容') });
    expect((await snapshot()).records[0]).toMatchObject({ owner_id: ACCOUNT_B, payload: journal('B 私人内容') });
    await authenticate(ACCOUNT_A);
    expect((await snapshot()).records[0]).toMatchObject({ owner_id: ACCOUNT_A, payload: journal('A 私人内容') });
  });

  it('生产 GRANT 撤销浏览器所有直接写入、TRUNCATE 和 receipt/revision 读取权限', async () => {
    await apply();
    await expect(database.query('UPDATE public.user_records SET version = 999')).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('DELETE FROM public.user_records')).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('TRUNCATE public.user_records')).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('SELECT * FROM charisma_private.mutation_receipts')).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('SELECT * FROM charisma_private.sync_revisions')).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('INSERT INTO public.user_records(owner_id,id,kind,payload) VALUES ($1,$2,$3,$4::jsonb)', [ACCOUNT_A, entityId(2), 'journalEntry', JSON.stringify(journal())])).rejects.toMatchObject({ code: '42501' });
    expect((await snapshot()).records[0].version).toBe(1);
  });

  it('单独验证四种 RLS 政策：临时授予测试 DML 后仍不能写、改、删别人的记录或更换 owner', async () => {
    await apply({ payload: journal('A 原始记录') });
    await authenticate(ACCOUNT_B);
    await apply({ id: entityId(2), payload: journal('B 原始记录') });
    await administrator();
    await database.exec('GRANT INSERT, UPDATE, DELETE ON public.user_records TO authenticated');
    await authenticate(ACCOUNT_A);
    await expect(database.query('INSERT INTO public.user_records(owner_id,id,kind,payload) VALUES ($1,$2,$3,$4::jsonb)', [ACCOUNT_B, entityId(3), 'journalEntry', JSON.stringify(journal())])).rejects.toMatchObject({ code: '42501' });
    await expect(database.query('UPDATE public.user_records SET owner_id = $1 WHERE id = $2', [ACCOUNT_B, entityId(1)])).rejects.toMatchObject({ code: '42501' });
    expect((await database.query('UPDATE public.user_records SET payload = $1::jsonb WHERE owner_id = $2', [JSON.stringify(journal('非法写入')), ACCOUNT_B])).affectedRows).toBe(0);
    expect((await database.query('DELETE FROM public.user_records WHERE owner_id = $1', [ACCOUNT_B])).affectedRows).toBe(0);
    expect((await database.query('UPDATE public.user_records SET payload = $1::jsonb WHERE id = $2', [JSON.stringify(journal('A 可修改自己的记录')), entityId(1)])).affectedRows).toBe(1);
    expect((await database.query('DELETE FROM public.user_records WHERE id = $1', [entityId(1)])).affectedRows).toBe(1);
    await authenticate(ACCOUNT_B);
    expect((await snapshot()).records[0].payload).toEqual(journal('B 原始记录'));
  });

  it('无认证身份不能调用 RPC；anon 没有任何 RPC 的 EXECUTE', async () => {
    await authenticate(null);
    await expect(apply()).rejects.toMatchObject({ code: '28000' });
    await expect(snapshot()).rejects.toMatchObject({ code: '28000' });
    await expect(deleteCloud()).rejects.toMatchObject({ code: '28000' });
    await authenticate(null, 'anon');
    await expect(apply()).rejects.toMatchObject({ code: '42501' });
    await expect(snapshot()).rejects.toMatchObject({ code: '42501' });
    await expect(deleteCloud()).rejects.toMatchObject({ code: '42501' });
  });

  it('函数 SECURITY DEFINER 与 search_path 固定，临时同名表不改变快照来源', async () => {
    await apply();
    await database.exec('CREATE TEMP TABLE user_records(id uuid, payload jsonb)');
    expect((await snapshot()).records[0].id).toBe(entityId(1));
    await database.exec('DROP TABLE pg_temp.user_records');
    await administrator();
    const functions = await database.query<{ proname: string; prosecdef: boolean; proconfig: string[] }>(
      `SELECT proname,prosecdef,proconfig FROM pg_proc WHERE proname IN ('apply_mutation','sync_snapshot','request_cloud_deletion')`,
    );
    expect(functions.rows).toHaveLength(3);
    for (const fn of functions.rows) {
      expect(fn.prosecdef).toBe(true);
      expect(fn.proconfig).toContain('search_path=pg_catalog, pg_temp');
    }
  });

  it('有效业务 payload 全部12种可保存，静态课程及未知种类被拒绝', async () => {
    const scores = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`M${String(n + 1).padStart(2, '0')}`, 3]));
    const payloads = {
      profile: { name: '同学', focus: ['M04','M06','M08'], dailyMinutes: 15, weeklyDays: 5, scene: '校园', goal: '从容表达', startDate: '2026-10-13' },
      courseProgress: { lessonId: 'M04-L01', stage: 4, completed: true, quizScore: 100 },
      lessonNote: { lessonId: 'M04-L01', text: '笔记', bookmarked: true },
      trainingTask: { title: '任务', minutes: 5, moduleId: 'M04', description: '说明一个想法' },
      trainingRecord: { taskId: 'M04-T01', title: '任务', moduleId: 'M04', minutes: 5, date: '2026-10-13', difficulty: '入门', reflection: '发现', completed: true },
      scenarioAttempt: { scenarioId: 'M04-S01', path: ['start:0'], reflection: '尊重边界' },
      assessmentResult: { type: 'initial-self', answers: Array(24).fill(3), scores },
      selfEvaluation: { scores }, journalEntry: journal(),
      growthGoal: { title: '练表达', deadline: '', priority: '高', status: '进行中' },
      userInterest: { name: '摄影', note: '观察光线' }, appSettings: { theme: 'warm' },
    };
    for (const [index, [kind, payload]] of Object.entries(payloads).entries()) {
      expect((await apply({ id: entityId(index + 1), kind, payload })).status).toBe('applied');
    }
    expect((await snapshot()).records).toHaveLength(12);
    await expect(apply({ id: entityId(99), kind: 'publicCourse', payload: {} })).rejects.toMatchObject({ code: '22023' });
  });

  it('payload 基础结构、字段类型、未知字段、日期、长度与自评数学一致性在数据库拒绝', async () => {
    const invalid = [journal().body, [], {}, { ...journal(), body: 42 }, { ...journal(), hidden: true },
      { ...journal(), date: '2026-02-30' }, { ...journal(), tags: ['长'.repeat(41)] }, { ...journal(), body: 'a'.repeat(1_000_001) }];
    for (const payload of invalid) await expect(apply({ payload })).rejects.toMatchObject({ code: '22023' });
    const scores = Object.fromEntries(Array.from({ length: 12 }, (_, n) => [`M${String(n + 1).padStart(2, '0')}`, 3]));
    await expect(apply({ kind: 'assessmentResult', payload: { type: 'initial-self', answers: Array(24).fill(3), scores: { ...scores, M01: 5 } } })).rejects.toMatchObject({ code: '22023' });
    await expect(apply({ kind: 'selfEvaluation', payload: { scores: { ...scores, unknown: 3 } } })).rejects.toMatchObject({ code: '22023' });
    expect((await snapshot()).records).toEqual([]);
  });

  it('分页 keyset 完整读取，跨页版本变化检测后可重新扫描且不漏较小新ID', async () => {
    for (const id of [2, 3, 4]) await apply({ id: entityId(id) });
    const first = await snapshot(null, 2);
    expect(first.records.map(row => row.id)).toEqual([entityId(2), entityId(3)]);
    expect(first.nextCursor).toBe(entityId(3));
    const last = await snapshot(first.nextCursor, 2, first.revision);
    expect(last.records.map(row => row.id)).toEqual([entityId(4)]);
    expect(last.nextCursor).toBeNull();
    expect((await snapshot(entityId(4), 2, first.revision)).records).toEqual([]);
    await apply({ id: entityId(1) });
    expect(await snapshot(first.nextCursor, 2, first.revision)).toEqual({ revision: 4, changed: true, records: [], nextCursor: null });
    const restarted = await snapshot(null, 500);
    expect(restarted.records.map(row => row.id)).toEqual([1,2,3,4].map(entityId));
    await authenticate(ACCOUNT_B);
    await apply({ id: entityId(1) });
    await authenticate(ACCOUNT_A);
    expect((await snapshot(null, 500, 4)).changed).toBe(false);
    await expect(snapshot(null, 0)).rejects.toMatchObject({ code: '22023' });
    await expect(snapshot(null, 501)).rejects.toMatchObject({ code: '22023' });
  });

  it('整账号软删除只影响本人，保留 Tombstone 和 receipts，重复请求不再增加版本', async () => {
    await apply({ id: entityId(1) });
    await apply({ id: entityId(2) });
    await authenticate(ACCOUNT_B);
    await apply({ id: entityId(1) });
    await authenticate(ACCOUNT_A);
    expect(await deleteCloud()).toEqual({ deleted_count: 2, revision: 3 });
    const deleted = await snapshot();
    expect(deleted.records.every(row => row.deleted_at !== null && row.version === 2)).toBe(true);
    expect(await deleteCloud()).toEqual({ deleted_count: 0, revision: 3 });
    expect((await apply({ baseVersion: 2 })).status).toBe('conflict');
    await authenticate(ACCOUNT_B);
    expect((await snapshot()).records[0].deleted_at).toBeNull();
    await administrator();
    expect((await database.query<{ count: number }>('SELECT count(*)::integer AS count FROM charisma_private.mutation_receipts')).rows[0].count).toBe(4);
  });

  it('receipt 落库失败时，业务记录及 revision 一起回滚，不留下部分成功', async () => {
    await administrator();
    await database.exec(`
      CREATE FUNCTION charisma_private.reject_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Injected receipt failure'; END; $$;
      CREATE TRIGGER reject_receipt BEFORE INSERT ON charisma_private.mutation_receipts
      FOR EACH ROW EXECUTE FUNCTION charisma_private.reject_test_receipt();
    `);
    try {
      await authenticate(ACCOUNT_A);
      await expect(apply()).rejects.toThrow('Injected receipt failure');
      await administrator();
      const counts = await database.query<{ records: number; revisions: number; receipts: number }>(`SELECT
        (SELECT count(*)::integer FROM public.user_records) AS records,
        (SELECT count(*)::integer FROM charisma_private.sync_revisions) AS revisions,
        (SELECT count(*)::integer FROM charisma_private.mutation_receipts) AS receipts`);
      expect(counts.rows[0]).toEqual({ records: 0, revisions: 0, receipts: 0 });
    } finally {
      await administrator();
      await database.exec('DROP TRIGGER reject_receipt ON charisma_private.mutation_receipts; DROP FUNCTION charisma_private.reject_test_receipt()');
    }
  });
});
