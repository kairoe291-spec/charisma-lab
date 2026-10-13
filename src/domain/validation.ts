import { z } from 'zod';
import type { Backup, BusinessRecord, RecordKind, RecordPayloads } from './types';

const text = z.string().max(1_000_000);
const short = z.string().max(200);
const identifier = z.string().min(1).max(160);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期应为 YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, '日期不存在');
const timestamp = z.iso.datetime({ offset: true });
const scores = z.record(identifier, z.number().min(0).max(100));
export const MODULE_IDS = [
  'M01',
  'M02',
  'M03',
  'M04',
  'M05',
  'M06',
  'M07',
  'M08',
  'M09',
  'M10',
  'M11',
  'M12',
] as const;
// Zod 4 exhaustively checks enum record keys: no missing or unknown dimensions.
const selfEvaluationScores = z.record(z.enum(MODULE_IDS), z.number().min(1).max(5));
export const initialSelfAssessmentSchema = z
  .object({
    answers: z.array(z.number().int().min(1).max(5)).length(24),
    scores: selfEvaluationScores,
  })
  .strict()
  .superRefine((value, ctx) => {
    MODULE_IDS.forEach((moduleId, index) => {
      const expected = (value.answers[index * 2] + value.answers[index * 2 + 1]) / 2;
      if (value.scores[moduleId] !== expected) {
        ctx.addIssue({
          code: 'custom',
          path: ['scores', moduleId],
          message: `${moduleId} 自评分必须等于对应两题的平均值（${expected}）`,
        });
      }
    });
  });

export const payloadSchemas = {
  profile: z
    .object({
      name: z.string().min(1).max(80),
      focus: z
        .array(z.enum(MODULE_IDS))
        .max(3)
        .refine((value) => new Set(value).size === value.length, '关注维度不能重复'),
      dailyMinutes: z.number().int().min(1).max(240),
      weeklyDays: z.number().int().min(1).max(7),
      scene: short,
      goal: z.string().max(5000),
      startDate: date,
    })
    .strict(),
  courseProgress: z
    .object({
      lessonId: identifier,
      stage: z.number().int().min(0).max(5),
      completed: z.boolean(),
      quizScore: z.number().min(0).max(100).optional(),
    })
    .strict(),
  lessonNote: z.object({ lessonId: identifier, text, bookmarked: z.boolean() }).strict(),
  trainingTask: z
    .object({
      title: z.string().min(1).max(200),
      minutes: z.number().int().min(1).max(240),
      moduleId: identifier,
      description: z.string().max(20_000),
    })
    .strict(),
  trainingRecord: z
    .object({
      taskId: identifier,
      title: z.string().min(1).max(200),
      moduleId: identifier,
      minutes: z.number().int().min(1).max(240),
      date,
      difficulty: short,
      reflection: z.string().max(20_000),
      completed: z.boolean(),
    })
    .strict(),
  scenarioAttempt: z
    .object({
      scenarioId: identifier,
      path: z.array(identifier).max(100),
      reflection: z.string().max(20_000),
    })
    .strict(),
  assessmentResult: z
    .object({ type: identifier, answers: z.array(z.number()).max(500), scores })
    .strict()
    .superRefine((value, ctx) => {
      if (value.type !== 'initial-self') return;
      const result = initialSelfAssessmentSchema.safeParse({
        answers: value.answers,
        scores: value.scores,
      });
      if (!result.success)
        for (const issue of result.error.issues) {
          ctx.addIssue({
            code: 'custom',
            path: issue.path,
            message: `初始自评结果无效：${issue.message}`,
          });
        }
    }),
  selfEvaluation: z.object({ scores: selfEvaluationScores }).strict(),
  journalEntry: z
    .object({
      title: z.string().min(1).max(200),
      body: text,
      tags: z.array(z.string().max(40)).max(20),
      category: short,
      date,
    })
    .strict(),
  growthGoal: z
    .object({
      title: z.string().min(1).max(200),
      deadline: z.union([date, z.literal('')]),
      priority: short,
      status: short,
    })
    .strict(),
  userInterest: z
    .object({ name: z.string().min(1).max(160), note: z.string().max(20_000) })
    .strict(),
  appSettings: z.object({ theme: z.enum(['dark', 'light', 'warm']) }).strict(),
} satisfies { [K in RecordKind]: z.ZodType<RecordPayloads[K]> };

export const recordKinds = Object.keys(payloadSchemas) as RecordKind[];
export const scopeSchema = z.string().min(1).max(100);
const baseSchema = z.object({
  id: z.uuid(),
  importedCopyOf: z.uuid().optional(),
  ownerScope: scopeSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
  serverVersion: z.number().int().min(0),
  serverUpdatedAt: timestamp.optional(),
  localRevision: z.number().int().min(1),
  deletedAt: timestamp.optional(),
  syncStatus: z.enum(['local', 'pending', 'synced']),
});

// An explicit discriminated union validates that each kind has its own payload shape.
export const businessRecordSchema = z.discriminatedUnion('kind', [
  baseSchema.extend({ kind: z.literal('profile'), payload: payloadSchemas.profile }).strict(),
  baseSchema
    .extend({ kind: z.literal('courseProgress'), payload: payloadSchemas.courseProgress })
    .strict(),
  baseSchema.extend({ kind: z.literal('lessonNote'), payload: payloadSchemas.lessonNote }).strict(),
  baseSchema
    .extend({ kind: z.literal('trainingTask'), payload: payloadSchemas.trainingTask })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('trainingRecord'), payload: payloadSchemas.trainingRecord })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('scenarioAttempt'), payload: payloadSchemas.scenarioAttempt })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('assessmentResult'), payload: payloadSchemas.assessmentResult })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('selfEvaluation'), payload: payloadSchemas.selfEvaluation })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('journalEntry'), payload: payloadSchemas.journalEntry })
    .strict(),
  baseSchema.extend({ kind: z.literal('growthGoal'), payload: payloadSchemas.growthGoal }).strict(),
  baseSchema
    .extend({ kind: z.literal('userInterest'), payload: payloadSchemas.userInterest })
    .strict(),
  baseSchema
    .extend({ kind: z.literal('appSettings'), payload: payloadSchemas.appSettings })
    .strict(),
]) satisfies z.ZodType<BusinessRecord>;

export const backupSchema = z
  .object({
    schemaVersion: z.literal(1),
    exportedAt: timestamp,
    appVersion: z.string().min(1).max(80),
    records: z.array(businessRecordSchema).max(100_000),
  })
  .strict()
  .superRefine((backup, ctx) => {
    const ids = new Set<string>();
    for (const record of backup.records) {
      if (ids.has(record.id))
        ctx.addIssue({ code: 'custom', message: `备份包含重复记录 ID：${record.id}` });
      ids.add(record.id);
    }
  }) satisfies z.ZodType<Backup>;

export function validateBackup(value: unknown): Backup {
  const result = backupSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`备份校验失败：${issue.path.join('.')} ${issue.message}。原有数据未改动。`);
  }
  return result.data;
}
