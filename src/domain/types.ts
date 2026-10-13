/** Private application records. Teaching content lives separately in src/content. */
export interface RecordPayloads {
  profile: {
    name: string;
    focus: string[];
    dailyMinutes: number;
    weeklyDays: number;
    scene: string;
    goal: string;
    startDate: string;
  };
  courseProgress: { lessonId: string; stage: number; completed: boolean; quizScore?: number };
  lessonNote: { lessonId: string; text: string; bookmarked: boolean };
  trainingTask: { title: string; minutes: number; moduleId: string; description: string };
  trainingRecord: {
    taskId: string;
    title: string;
    moduleId: string;
    minutes: number;
    date: string;
    difficulty: string;
    reflection: string;
    completed: boolean;
  };
  scenarioAttempt: { scenarioId: string; path: string[]; reflection: string };
  assessmentResult: { type: string; answers: number[]; scores: Record<string, number> };
  selfEvaluation: { scores: Record<string, number> };
  journalEntry: { title: string; body: string; tags: string[]; category: string; date: string };
  growthGoal: { title: string; deadline: string; priority: string; status: string };
  userInterest: { name: string; note: string };
  appSettings: { theme: 'dark' | 'light' | 'warm' };
}

export type RecordKind = keyof RecordPayloads;
export type SyncStatus = 'local' | 'pending' | 'synced';

export interface RecordBase {
  id: string;
  /** A preserved backup alternative; it does not replace the active natural record. */
  importedCopyOf?: string;
  ownerScope: string;
  createdAt: string;
  /** Device timestamp for display; never used as cloud conflict authority. */
  updatedAt: string;
  /** Last acknowledged, trusted server version. Zero means not uploaded. */
  serverVersion: number;
  serverUpdatedAt?: string;
  localRevision: number;
  deletedAt?: string;
  syncStatus: SyncStatus;
}

export type BusinessRecord<K extends RecordKind = RecordKind> = K extends RecordKind
  ? RecordBase & { kind: K; payload: RecordPayloads[K] }
  : never;

export interface OutboxMutation {
  mutationId: string;
  entityType: RecordKind;
  entityId: string;
  ownerScope: string;
  operation: 'upsert' | 'delete';
  payload: BusinessRecord;
  baseVersion: number;
  localRevision: number;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  nextRetryAt: string;
  status: 'local' | 'pending' | 'sending' | 'retry' | 'conflict';
  lastError?: string;
}

export interface SyncMetadata {
  ownerScope: string;
  key: string;
  lastSuccessAt?: string;
  lastError?: string;
  value?: string;
}

export interface ConflictRecord {
  id: string;
  ownerScope: string;
  entityId: string;
  local: BusinessRecord;
  remote: BusinessRecord;
  detectedAt: string;
  resolvedAt?: string;
}

export interface Backup {
  schemaVersion: 1;
  exportedAt: string;
  appVersion: string;
  /** Includes tombstones so a backup cannot accidentally resurrect old IDs. */
  records: BusinessRecord[];
}

export interface SafetyBackup {
  id: string;
  ownerScope: string;
  reason: 'import-merge' | 'import-replace' | 'clear';
  createdAt: string;
  backup: Backup;
}

export interface ImportResult {
  added: number;
  copied: number;
  skipped: number;
  safetyBackupId: string;
}
