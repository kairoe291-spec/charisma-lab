/** Existing on-disk identity and v1 stores. Keep these unchanged for existing browsers. */
export const LOCAL_DATABASE_NAME = 'charisma-lab-v2';
export const LOCAL_SCHEMA_VERSION = 1;
export const LOCAL_SCHEMA_V1 = {
  records: '[ownerScope+id], ownerScope, [ownerScope+kind], [ownerScope+updatedAt]',
  outbox: 'mutationId, ownerScope, [ownerScope+entityId], [ownerScope+status], nextRetryAt',
  syncMetadata: '[ownerScope+key], ownerScope',
  conflicts: 'id, ownerScope, [ownerScope+entityId]',
  safetyBackups: 'id, ownerScope, [ownerScope+createdAt]',
};
