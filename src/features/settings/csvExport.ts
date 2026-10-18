import type { BusinessRecord } from '../../domain/types';

/** Preserve the existing columns and mapping; encoding/escaping stays in utils/files. */
export function buildTrainingCsvRows(records: BusinessRecord[]): (string | number)[][] {
  return [
    ['日期', '任务', '模块', '分钟', '难度', '心得'],
    ...records
      .filter((record) => record.kind === 'trainingRecord')
      .map((record) => {
        const p = record.payload;
        return [p.date, p.title, p.moduleId, p.minutes, p.difficulty, p.reflection];
      }),
  ];
}

export function buildAssessmentCsvRows(records: BusinessRecord[]): (string | number)[][] {
  return [
    ['时间', '类型', '维度', '分值', '量表'],
    ...records
      .filter((record) => record.kind === 'assessmentResult')
      .flatMap((record) =>
        Object.entries(record.payload.scores).map(([dimension, value]) => [
          record.createdAt,
          record.payload.type,
          dimension,
          value,
          record.payload.type === 'initial-self' ? '行为自评 1—5' : '知识/理解 0—100',
        ]),
      ),
  ];
}
