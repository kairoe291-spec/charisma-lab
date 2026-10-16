/** UI-facing aliases of existing persisted payloads; no new storage model. */
import type { RecordPayloads } from '../domain/types';
export type { BusinessRecord, RecordKind, RecordPayloads } from '../domain/types';
export type { Module, QuizQuestion, Lesson, Training, Scenario } from './content';
export type UserProfile = RecordPayloads['profile'];
export type CourseProgress = RecordPayloads['courseProgress'];
export type LessonNote = RecordPayloads['lessonNote'];
export type TrainingRecord = RecordPayloads['trainingRecord'];
export type JournalEntry = RecordPayloads['journalEntry'];
export type AssessmentResult = RecordPayloads['assessmentResult'];
export type SelfEvaluation = RecordPayloads['selfEvaluation'];
