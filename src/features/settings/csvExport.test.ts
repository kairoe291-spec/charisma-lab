import { describe, expect, it } from 'vitest';
import type { BusinessRecord } from '../../domain/types';
import { csvCell } from '../../utils/files';
import { buildAssessmentCsvRows, buildTrainingCsvRows } from './csvExport';

const base = {
  id: 'one',
  ownerScope: 'guest',
  createdAt: '2026-10-17T08:00:00.000Z',
  updatedAt: '2026-10-17T08:00:00.000Z',
  serverVersion: 0,
  localRevision: 1,
  syncStatus: 'local' as const,
};

const training: BusinessRecord<'trainingRecord'> = {
  ...base,
  kind: 'trainingRecord',
  payload: {
    taskId: 'task-1',
    title: '中文,「表达」',
    moduleId: 'M04',
    minutes: 15,
    date: '2026-10-17',
    difficulty: '入门',
    reflection: '=SUM(1,2)\n他说 "你好"',
    completed: true,
  },
};

const assessment: BusinessRecord<'assessmentResult'> = {
  ...base,
  id: 'two',
  kind: 'assessmentResult',
  payload: { type: 'initial-self', answers: [3, 4], scores: { M01: 3.5, M02: 4 } },
};

const journal: BusinessRecord<'journalEntry'> = {
  ...base,
  id: 'three',
  kind: 'journalEntry',
  payload: {
    title: '私人日志',
    body: '绝不能进入普通统计 CSV 的私人正文',
    tags: [],
    category: '每日成长',
    date: '2026-10-17',
  },
};

describe('settings statistics CSV rows', () => {
  it.each(['=1+1', '+SUM(1,2)', '-12', '@SUM(A1)', '  =1+1', '\t-12', ' \t@SUM(A1)'])(
    'protects untrusted string cells starting with formula syntax: %j',
    (value) => {
      expect(csvCell(value)).toBe(`"'${value}"`);
    },
  );

  it('keeps real finite negative numbers numeric while still guarding numeric-looking strings', () => {
    expect(csvCell(-12)).toBe('"-12"');
    expect(csvCell(-0.5)).toBe('"-0.5"');
    expect(csvCell('-12')).toBe('"\'-12"');
    expect(csvCell(Number.NEGATIVE_INFINITY)).toBe('"\'-Infinity"');
  });

  it('preserves quoted CSV cells with Chinese, commas, embedded quotes and newlines', () => {
    expect(csvCell('中文,他说 "你好"\n下一行')).toBe('"中文,他说 ""你好""\n下一行"');
  });

  it('keeps original headers and empty exports', () => {
    expect(buildTrainingCsvRows([])).toEqual([['日期', '任务', '模块', '分钟', '难度', '心得']]);
    expect(buildAssessmentCsvRows([])).toEqual([['时间', '类型', '维度', '分值', '量表']]);
  });

  it('maps training fields in their original order and excludes private journals', () => {
    const rows = buildTrainingCsvRows([journal, assessment, training]);
    expect(rows).toEqual([
      ['日期', '任务', '模块', '分钟', '难度', '心得'],
      ['2026-10-17', '中文,「表达」', 'M04', 15, '入门', '=SUM(1,2)\n他说 "你好"'],
    ]);
    const serialized = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    expect(serialized).toContain('"中文,「表达」"');
    expect(serialized).toContain('"\'=SUM(1,2)\n他说 ""你好"""');
    expect(serialized).not.toContain(journal.payload.body);
  });

  it('maps one assessment row per dimension with the original scale labels', () => {
    expect(buildAssessmentCsvRows([journal, training, assessment])).toEqual([
      ['时间', '类型', '维度', '分值', '量表'],
      [base.createdAt, 'initial-self', 'M01', 3.5, '行为自评 1—5'],
      [base.createdAt, 'initial-self', 'M02', 4, '行为自评 1—5'],
    ]);
    const knowledge: BusinessRecord<'assessmentResult'> = {
      ...assessment,
      id: 'four',
      payload: { type: 'knowledge', answers: [], scores: { M04: 80 } },
    };
    expect(buildAssessmentCsvRows([knowledge])[1]).toEqual([
      base.createdAt,
      'knowledge',
      'M04',
      80,
      '知识/理解 0—100',
    ]);
  });
});
