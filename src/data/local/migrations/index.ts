import type Dexie from 'dexie';
import { LOCAL_SCHEMA_V1, LOCAL_SCHEMA_VERSION } from '../schema';

/** Register historical schemas in order. Add version(2) here only with a real migration. */
export function registerLocalMigrations(database: Dexie): void {
  database.version(LOCAL_SCHEMA_VERSION).stores(LOCAL_SCHEMA_V1);
}
