import Dexie, { type Table } from 'dexie';
import type {
  BusinessRecord,
  ConflictRecord,
  OutboxMutation,
  SafetyBackup,
  SyncMetadata,
} from '../domain/types';

/** The compound key isolates identities even when a backup preserves a record ID. */
export class CharismaDatabase extends Dexie {
  records!: Table<BusinessRecord, [string, string]>;
  outbox!: Table<OutboxMutation, string>;
  syncMetadata!: Table<SyncMetadata, [string, string]>;
  conflicts!: Table<ConflictRecord, string>;
  safetyBackups!: Table<SafetyBackup, string>;

  constructor(name = 'charisma-lab-v2') {
    super(name);
    this.version(1).stores({
      records: '[ownerScope+id], ownerScope, [ownerScope+kind], [ownerScope+updatedAt]',
      outbox: 'mutationId, ownerScope, [ownerScope+entityId], [ownerScope+status], nextRetryAt',
      syncMetadata: '[ownerScope+key], ownerScope',
      conflicts: 'id, ownerScope, [ownerScope+entityId]',
      safetyBackups: 'id, ownerScope, [ownerScope+createdAt]',
    });
  }
}

export const db = new CharismaDatabase();
