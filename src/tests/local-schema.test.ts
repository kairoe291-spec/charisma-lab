import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { CharismaDatabase } from '../data/database';
import { Repository } from '../data/repository';

it('opens an existing v1 IndexedDB without changing its stores or private records', async () => {
  const name = `charisma-legacy-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  // The persisted v1 layout, deliberately independent of the new schema constant.
  legacy.version(1).stores({
    records: '[ownerScope+id], ownerScope, [ownerScope+kind], [ownerScope+updatedAt]',
    outbox: 'mutationId, ownerScope, [ownerScope+entityId], [ownerScope+status], nextRetryAt',
    syncMetadata: '[ownerScope+key], ownerScope',
    conflicts: 'id, ownerScope, [ownerScope+entityId]',
    safetyBackups: 'id, ownerScope, [ownerScope+createdAt]',
  });
  const id = crypto.randomUUID();
  const time = new Date().toISOString();
  await legacy.table('records').add({
    id,
    ownerScope: 'guest',
    kind: 'journalEntry',
    payload: {
      title: '旧版记录',
      body: '继续保留',
      tags: [],
      category: '每日成长',
      date: '2026-10-17',
    },
    createdAt: time,
    updatedAt: time,
    serverVersion: 0,
    localRevision: 1,
    syncStatus: 'local',
  });
  legacy.close();

  const database = new CharismaDatabase(name);
  try {
    const journal = await new Repository(database).get(id);
    expect(journal?.kind === 'journalEntry' && journal.payload.body).toBe('继续保留');
    expect(database.verno).toBe(1);
    expect(database.tables.map((table) => table.name).sort()).toEqual(
      ['records', 'outbox', 'syncMetadata', 'conflicts', 'safetyBackups'].sort(),
    );
  } finally {
    await database.delete();
  }
});
