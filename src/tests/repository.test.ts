import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CharismaDatabase } from '../data/database';
import { APP_VERSION, Repository } from '../data/repository';
import type { Backup, RecordPayloads } from '../domain/types';
import { MODULE_IDS } from '../domain/validation';

let database: CharismaDatabase;
let repository: Repository;
const journal = (body = '今天认真听完了一位同学的分享。'): RecordPayloads['journalEntry'] => ({
  title: '倾听练习',
  body,
  tags: ['倾听'],
  category: '每日成长',
  date: '2026-10-13',
});
const selfScores = (value = 3): Record<string, number> =>
  Object.fromEntries(MODULE_IDS.map((id) => [id, value]));

beforeEach(() => {
  database = new CharismaDatabase(`charisma-test-${crypto.randomUUID()}`);
  repository = new Repository(database);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await database.delete();
});

describe('local-first repository', () => {
  it('exports the release version and restores a 2.0.0-p1 backup without changing its schema or record ID', async () => {
    const saved = await repository.save('journalEntry', journal('旧版本备份里的正文'));
    const legacy = await repository.exportBackup();
    expect(legacy).toMatchObject({ schemaVersion: 1, appVersion: APP_VERSION });
    legacy.appVersion = '2.0.0-p1';
    expect(repository.previewBackup(JSON.stringify(legacy)).appVersion).toBe('2.0.0-p1');
    await repository.remove(saved.id);
    const result = await repository.importBackup(legacy, 'replace');
    expect(result.added).toBe(1);
    expect(await repository.get(saved.id)).toMatchObject({
      id: saved.id,
      ownerScope: 'guest',
      payload: journal('旧版本备份里的正文'),
    });
  });
  it('propagates an IndexedDB read failure and preserves the stored record', async () => {
    const saved = await repository.save('journalEntry', journal());
    vi.spyOn(database.records, 'get').mockRejectedValueOnce(
      new DOMException('Database temporarily unavailable', 'InvalidStateError'),
    );
    await expect(repository.get(saved.id)).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(await repository.get(saved.id)).toEqual(saved);
  });

  it('rejects a damaged import receipt before changing account records', async () => {
    const source = await repository.save('journalEntry', journal());
    const backup = await repository.exportBackup();
    const account = new Repository(database, 'user:a');
    await database.syncMetadata.put({
      ownerScope: 'user:a',
      key: `backupImport:guest:${source.id}:${source.localRevision}`,
      value: '{}',
    });
    await expect(account.importBackup(backup, 'merge')).rejects.toThrow('备份导入标记损坏');
    expect(await account.list()).toHaveLength(0);
    expect(await repository.get(source.id)).toEqual(source);
  });

  it('persists edits after closing and reopening IndexedDB, coalescing never-sent mutations', async () => {
    const created = await repository.save('journalEntry', journal());
    const firstMutation = await database.outbox.toArray();
    await repository.save('journalEntry', journal('修改后的复盘'), created.id);
    database.close();
    await database.open();
    const restored = await repository.get(created.id);
    expect(restored?.kind === 'journalEntry' && restored.payload.body).toBe('修改后的复盘');
    expect(restored?.localRevision).toBe(2);
    const queue = await database.outbox.toArray();
    expect(queue).toHaveLength(1);
    expect(queue[0].mutationId).toBe(firstMutation[0].mutationId);
    expect(queue[0].baseVersion).toBe(0);
    expect(queue[0].status).toBe('local');
    expect(queue[0].payload).toEqual(restored);
  });

  it('rolls back the business write when writing its outbox mutation fails', async () => {
    vi.spyOn(database.outbox, 'put').mockRejectedValueOnce(new Error('storage failure'));
    await expect(repository.save('journalEntry', journal())).rejects.toThrow('storage failure');
    expect(await repository.list()).toHaveLength(0);
    expect(await repository.countOutbox()).toBe(0);
  });

  it('isolates guest and both account scopes even when record IDs are equal', async () => {
    const a = await repository.save('journalEntry', journal('A 的私人日志'), undefined, 'user:a');
    await repository.save('journalEntry', journal('B 的私人日志'), a.id, 'user:b');
    expect(await repository.list()).toHaveLength(0);
    const own = await repository.get(a.id, 'user:a');
    const other = await repository.get(a.id, 'user:b');
    expect(own?.kind === 'journalEntry' && own.payload.body).toBe('A 的私人日志');
    expect(other?.kind === 'journalEntry' && other.payload.body).toBe('B 的私人日志');
    await repository.remove(a.id, 'user:b');
    expect(await repository.get(a.id, 'user:a')).toEqual(own);
    expect(await repository.countOutbox('user:a')).toBe(1);
  });

  it('soft deletes with a tombstone and prevents an old editor resurrecting that ID', async () => {
    const saved = await repository.save('journalEntry', journal());
    await repository.remove(saved.id);
    expect(await repository.get(saved.id)).toBeUndefined();
    expect(await repository.list('journalEntry')).toHaveLength(0);
    expect((await database.records.get(['guest', saved.id]))?.deletedAt).toBeTruthy();
    expect((await database.outbox.toArray())[0].operation).toBe('delete');
    expect((await repository.exportBackup()).records[0].deletedAt).toBeTruthy();
    await expect(
      repository.save('journalEntry', journal('旧页面的内容'), saved.id),
    ).rejects.toThrow('已删除');
  });

  it('preserves attempted mutation IDs and payloads after a timeout', async () => {
    const saved = await repository.save('journalEntry', journal(), undefined, 'user:a');
    const first = (await database.outbox.toArray())[0];
    await database.outbox.update(first.mutationId, { status: 'retry', retryCount: 1 });
    await repository.save('journalEntry', journal('超时后继续编辑'), saved.id, 'user:a');
    const queue = await database.outbox.toArray();
    expect(queue).toHaveLength(2);
    expect(queue.find((item) => item.mutationId === first.mutationId)?.payload).toEqual(
      first.payload,
    );
  });

  it('commits an initial answer sheet and radar evaluation together, including both outbox entries', async () => {
    const scores = selfScores();
    const result = await repository.saveSelfAssessment(Array(24).fill(3), scores);
    expect(result.assessment.payload.type).toBe('initial-self');
    expect(result.evaluation.payload.scores).toEqual(scores);
    expect(await repository.list('assessmentResult')).toHaveLength(1);
    expect(await repository.list('selfEvaluation')).toHaveLength(1);
    expect(await repository.countOutbox()).toBe(2);
  });

  it('rolls back the entire assessment when the second result cannot be queued', async () => {
    const scores = selfScores();
    const realPut = database.outbox.put.bind(database.outbox);
    vi.spyOn(database.outbox, 'put')
      .mockImplementationOnce(realPut)
      .mockRejectedValueOnce(new Error('second result storage failure'));
    await expect(repository.saveSelfAssessment(Array(24).fill(3), scores)).rejects.toThrow(
      'second result storage failure',
    );
    expect(await repository.list()).toHaveLength(0);
    expect(await repository.countOutbox()).toBe(0);
  });

  it('preserves fractional 1–5 averages without confusing them with knowledge percentages', async () => {
    const answers = Array<number>(24).fill(3);
    answers[0] = 2;
    const scores = { ...selfScores(), M01: 2.5 };
    await repository.saveSelfAssessment(answers, scores);
    const result = (await repository.list('selfEvaluation'))[0];
    expect(result.payload.scores.M01).toBe(2.5);
    await repository.save('assessmentResult', {
      type: 'knowledge',
      answers: [0, 1],
      scores: { M04: 100 },
    });
    expect(
      (await repository.list('assessmentResult')).some(
        (record) => record.payload.scores.M04 === 100,
      ),
    ).toBe(true);
  });

  it.each([0, 6, 50, NaN])(
    'rejects out-of-scale self-evaluation score %s without writing data',
    async (invalid) => {
      await expect(
        repository.save('selfEvaluation', { scores: { ...selfScores(), M01: invalid } }),
      ).rejects.toThrow();
      expect(await repository.list()).toHaveLength(0);
      expect(await repository.countOutbox()).toBe(0);
    },
  );

  it('rejects missing or unknown self-evaluation dimensions and mismatched answer averages', async () => {
    const incomplete = selfScores();
    delete incomplete.M12;
    await expect(repository.save('selfEvaluation', { scores: incomplete })).rejects.toThrow();
    await expect(
      repository.save('selfEvaluation', { scores: { ...selfScores(), M13: 3 } }),
    ).rejects.toThrow();
    await expect(
      repository.saveSelfAssessment(Array(24).fill(3), { ...selfScores(), M04: 4 }),
    ).rejects.toThrow('平均值');
    await expect(
      repository.save('assessmentResult', {
        type: 'initial-self',
        answers: Array(24).fill(3),
        scores: { ...selfScores(), M04: 4 },
      }),
    ).rejects.toThrow('平均值');
    expect(await repository.list()).toHaveLength(0);
    expect(await repository.countOutbox()).toBe(0);
  });

  it('accepts flexible known focus dimensions while rejecting duplicates and unknown IDs', async () => {
    const profile: RecordPayloads['profile'] = {
      name: '探索者',
      focus: ['M04'],
      dailyMinutes: 15,
      weeklyDays: 5,
      scene: '小组讨论',
      goal: '从容表达',
      startDate: '2026-10-13',
    };
    const saved = await repository.save('profile', profile);
    await expect(
      repository.save('profile', { ...profile, focus: ['M04', 'M04'] }, saved.id),
    ).rejects.toThrow('不能重复');
    await expect(
      repository.save('profile', { ...profile, focus: ['M99'] }, saved.id),
    ).rejects.toThrow();
    expect((await repository.get(saved.id))?.payload).toEqual(profile);
    expect(await repository.countOutbox()).toBe(1);
  });
});

describe('backup safety', () => {
  it('rejects forged self-assessment averages when previewing backups', async () => {
    const result = await repository.saveSelfAssessment(Array(24).fill(3), selfScores());
    const backup = await repository.exportBackup();
    const record = backup.records.find((item) => item.id === result.assessment.id)!;
    if (record.kind === 'assessmentResult') record.payload.scores.M01 = 4;
    expect(() => repository.previewBackup(JSON.stringify(backup))).toThrow('平均值');
    expect((await repository.list('assessmentResult'))[0].payload.scores.M01).toBe(3);
  });
  it('rejects malformed, unsupported and duplicate-ID backups without changing data', async () => {
    await repository.save('journalEntry', journal());
    const backup = await repository.exportBackup();
    const before = await database.records.toArray();
    expect(() => repository.previewBackup('{')).toThrow('JSON');
    expect(() => repository.previewBackup(JSON.stringify({ ...backup, schemaVersion: 2 }))).toThrow(
      '校验失败',
    );
    expect(() =>
      repository.previewBackup(
        JSON.stringify({ ...backup, records: [...backup.records, ...backup.records] }),
      ),
    ).toThrow('重复');
    await expect(
      repository.importBackup(
        {
          ...backup,
          records: [{ ...backup.records[0], payload: { title: 123 } }],
        } as unknown as Backup,
        'replace',
      ),
    ).rejects.toThrow('校验失败');
    expect(await database.records.toArray()).toEqual(before);
    expect(await database.safetyBackups.count()).toBe(0);
  });

  it('exports and restores courses, notes, training, assessment, settings and logs', async () => {
    await repository.save('profile', {
      name: '学习者',
      focus: ['M04', 'M06', 'M08'],
      dailyMinutes: 15,
      weeklyDays: 5,
      scene: '小组讨论',
      goal: '从容表达',
      startDate: '2026-10-13',
    });
    await repository.save('courseProgress', {
      lessonId: 'M04-L01',
      stage: 4,
      completed: true,
      quizScore: 100,
    });
    await repository.save('lessonNote', {
      lessonId: 'M04-L01',
      text: '先结论，再解释。',
      bookmarked: true,
    });
    await repository.save('trainingRecord', {
      taskId: 'T01',
      title: '一分钟表达',
      moduleId: 'M04',
      minutes: 5,
      date: '2026-10-13',
      difficulty: '轻量',
      reflection: '能够说清要点',
      completed: true,
    });
    await repository.save('assessmentResult', {
      type: 'initial',
      answers: [2, 3],
      scores: { M04: 62.5 },
    });
    await repository.save('appSettings', { theme: 'warm' });
    await repository.save('journalEntry', journal());
    const backup = repository.previewBackup(JSON.stringify(await repository.exportBackup()));
    await repository.clear();
    expect(await repository.list()).toHaveLength(0);
    const result = await repository.importBackup(backup, 'merge');
    const restored = await repository.exportBackup();
    expect(result.added).toBe(7);
    for (const source of backup.records) {
      const target = restored.records.find((record) => record.id === source.id);
      expect(target?.payload).toEqual(source.payload);
      expect(target?.kind).toBe(source.kind);
    }
    expect(await repository.countOutbox()).toBe(7);
    expect((await repository.importBackup(backup, 'merge')).skipped).toBe(7);
    expect(await repository.list()).toHaveLength(7);
  });

  it('merges a changed same-ID record as a copy and repeat imports do not duplicate it', async () => {
    const saved = await repository.save('journalEntry', journal());
    const backup = await repository.exportBackup();
    await repository.save('journalEntry', journal('本机继续编辑的内容'), saved.id);
    const imported = await repository.importBackup(backup, 'merge');
    expect(imported.copied).toBe(1);
    const records = await repository.list('journalEntry');
    expect(records.map((record) => record.payload.body)).toEqual(
      expect.arrayContaining([journal().body, '本机继续编辑的内容']),
    );
    expect((await repository.importBackup(backup, 'merge')).skipped).toBe(1);
    expect(await repository.list()).toHaveLength(2);
  });

  it.each(['profile', 'appSettings', 'courseProgress', 'lessonNote'] as const)(
    'keeps the current %s authoritative while preserving an imported alternative',
    async (kind) => {
      const before = {
        profile: {
          name: '原备份昵称',
          focus: ['M04'],
          dailyMinutes: 5,
          weeklyDays: 3,
          scene: '表达',
          goal: '从容交流',
          startDate: '2026-10-13',
        },
        appSettings: { theme: 'dark' as const },
        courseProgress: { lessonId: 'M04-L01', stage: 1, completed: false },
        lessonNote: { lessonId: 'M04-L01', text: '备份里的笔记', bookmarked: false },
      } satisfies Pick<RecordPayloads, 'profile' | 'appSettings' | 'courseProgress' | 'lessonNote'>;
      const current = {
        profile: { ...before.profile, name: '目前昵称', dailyMinutes: 15 },
        appSettings: { theme: 'warm' as const },
        courseProgress: { ...before.courseProgress, stage: 4, completed: true, quizScore: 100 },
        lessonNote: { ...before.lessonNote, text: '目前的笔记', bookmarked: true },
      } satisfies Pick<RecordPayloads, 'profile' | 'appSettings' | 'courseProgress' | 'lessonNote'>;
      const original = await repository.save(kind, before[kind]);
      const backup = await repository.exportBackup();
      await repository.save(kind, current[kind], original.id);
      expect((await repository.importBackup(backup, 'merge')).copied).toBe(1);
      // Make the ordering distinction explicit independently of millisecond ties.
      await database.records.update(['guest', original.id], {
        updatedAt: '2000-01-01T00:00:00.000Z',
      });
      const ordered = await repository.list(kind);
      expect(ordered).toHaveLength(2);
      expect(ordered[0].id).toBe(original.id);
      expect(ordered[0].payload).toEqual(current[kind]);
      const copy = ordered[1];
      expect(copy.importedCopyOf).toBe(original.id);
      expect(copy.payload).toEqual(before[kind]);
      expect((await repository.list())[0].id).toBe(copy.id);
      await repository.save(kind, before[kind], copy.id);
      expect((await repository.get(copy.id))?.importedCopyOf).toBe(original.id);
      const restored = repository.previewBackup(JSON.stringify(await repository.exportBackup()));
      await repository.importBackup(restored, 'replace');
      expect((await repository.list(kind))[0].id).toBe(original.id);
      expect((await repository.get(copy.id))?.importedCopyOf).toBe(original.id);
    },
  );

  it.each([
    ['profile', 'primary-first'],
    ['profile', 'copy-first'],
    ['lessonNote', 'primary-first'],
    ['lessonNote', 'copy-first'],
  ] as const)('replaces %s with stable IDs in %s backup order', async (kind, order) => {
    const before = {
      profile: {
        name: '备份昵称',
        focus: ['M04'],
        dailyMinutes: 5,
        weeklyDays: 3,
        scene: '表达',
        goal: '从容交流',
        startDate: '2026-10-13',
      },
      lessonNote: { lessonId: 'M04-L01', text: '备份笔记', bookmarked: false },
    } satisfies Pick<RecordPayloads, 'profile' | 'lessonNote'>;
    const current = {
      profile: { ...before.profile, name: '当前昵称' },
      lessonNote: { ...before.lessonNote, text: '当前笔记' },
    } satisfies Pick<RecordPayloads, 'profile' | 'lessonNote'>;
    const original = await repository.save(kind, before[kind]);
    const firstBackup = await repository.exportBackup();
    await repository.save(kind, current[kind], original.id);
    await repository.importBackup(firstBackup, 'merge');
    const copy = (await repository.list(kind)).find(
      (record) => record.importedCopyOf === original.id,
    )!;
    const accountRecord = await repository.save(kind, before[kind], original.id, 'user:a');
    const backup = await repository.exportBackup();
    const primarySource = backup.records.find((record) => record.id === original.id)!;
    const copySource = backup.records.find((record) => record.id === copy.id)!;
    backup.records =
      order === 'primary-first' ? [primarySource, copySource] : [copySource, primarySource];

    const result = await repository.importBackup(backup, 'replace');

    expect((await repository.get(original.id))?.payload).toEqual(current[kind]);
    expect((await repository.get(copy.id))?.payload).toEqual(before[kind]);
    expect((await repository.get(copy.id))?.importedCopyOf).toBe(original.id);
    expect((await repository.list(kind)).map((record) => record.id).sort()).toEqual(
      [original.id, copy.id].sort(),
    );
    expect(await repository.get(original.id, 'user:a')).toEqual(accountRecord);
    expect(result).toMatchObject({ added: 2, copied: 0, skipped: 0 });
    expect(await repository.countOutbox()).toBe(2);
  });

  it('allows an imported alternative to be used when its original is absent', async () => {
    const saved = await repository.save('lessonNote', {
      lessonId: 'M04-L01',
      text: '保留下来的副本',
      bookmarked: false,
    });
    const backup = await repository.exportBackup();
    backup.records[0].importedCopyOf = crypto.randomUUID();
    await repository.importBackup(backup, 'replace');
    expect((await repository.list('lessonNote'))[0].id).toBe(saved.id);
    expect((await repository.list('lessonNote'))[0].payload.text).toBe('保留下来的副本');
  });

  it('rewrites imported ownership and discards untrusted cloud version metadata', async () => {
    await repository.save('journalEntry', journal('A 的导出'), undefined, 'user:a');
    const backup = await repository.exportBackup('user:a');
    backup.records[0].serverVersion = 99;
    backup.records[0].syncStatus = 'synced';
    await repository.importBackup(backup, 'merge', 'guest');
    const imported = await repository.get(backup.records[0].id);
    expect(imported?.ownerScope).toBe('guest');
    expect(imported?.serverVersion).toBe(0);
    expect(imported?.syncStatus).toBe('local');
    expect(await repository.list(undefined, 'user:a')).toHaveLength(1);
  });

  it('persists a safety snapshot and atomically rolls back an interrupted replacement', async () => {
    const saved = await repository.save('journalEntry', journal('应当保留的数据'));
    const replacement: Backup = {
      schemaVersion: 1,
      appVersion: '2.0.0-p0',
      exportedAt: new Date().toISOString(),
      records: [{ ...saved, id: crypto.randomUUID(), payload: journal('即将导入的数据') }],
    };
    vi.spyOn(database.outbox, 'put').mockRejectedValueOnce(new Error('quota exceeded'));
    await expect(repository.importBackup(replacement, 'replace')).rejects.toThrow('quota exceeded');
    const record = await repository.get(saved.id);
    expect(record?.kind === 'journalEntry' && record.payload.body).toBe('应当保留的数据');
    expect(await repository.countOutbox()).toBe(1);
    const snapshots = await repository.listSafetyBackups();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].reason).toBe('import-replace');
    expect(snapshots[0].backup.records).toEqual([saved]);
  });
});
