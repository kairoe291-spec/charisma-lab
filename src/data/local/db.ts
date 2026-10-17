import Dexie, { type Table } from 'dexie';
import type {
  BusinessRecord,
  ConflictRecord,
  OutboxMutation,
  SafetyBackup,
  SyncMetadata,
} from '../../domain/types';
import { registerLocalMigrations } from './migrations';
import { LOCAL_DATABASE_NAME } from './schema';

/** The compound key isolates identities even when a backup preserves a record ID. */
export class CharismaDatabase extends Dexie {
  records!: Table<BusinessRecord, [string, string]>;
  outbox!: Table<OutboxMutation, string>;
  syncMetadata!: Table<SyncMetadata, [string, string]>;
  conflicts!: Table<ConflictRecord, string>;
  safetyBackups!: Table<SafetyBackup, string>;

  constructor(name = LOCAL_DATABASE_NAME) {
    super(name);
    registerLocalMigrations(this);
  }
}

export const db = new CharismaDatabase();
