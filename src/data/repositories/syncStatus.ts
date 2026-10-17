import { db } from '../database';

/** Read-only local sync status; the existing SyncEngine still owns mutations. */
export const syncStatusRepository = {
  listQueue: (scope: string) => db.outbox.where('ownerScope').equals(scope).toArray(),
  getMetadata: (scope: string) => db.syncMetadata.get([scope, 'sync']),
  countConflicts: (scope: string) => db.conflicts.where('ownerScope').equals(scope)
    .filter((record) => !record.resolvedAt).count(),
};
