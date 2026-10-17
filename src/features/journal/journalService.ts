import type { EntityRepository } from '../../data/repositories/contracts';
import type { BusinessRecord, JournalEntry } from '../../types';
import { today } from '../../utils/files';

export function filterJournalEntries(
  records: BusinessRecord<'journalEntry'>[],
  search: string,
  category: string,
) {
  return records.filter((r) => {
    const p = r.payload;
    return (
      (category === '全部' || p.category === category) &&
      [p.title, p.body, ...p.tags].join('').includes(search)
    );
  });
}

export function createJournalEntry(repository: EntityRepository<'journalEntry'>) {
  return repository.save({
    title: '未命名日志',
    body: '',
    tags: [],
    category: '每日成长',
    date: today(),
  });
}

export function saveJournalEntry(repository: EntityRepository<'journalEntry'>, id: string, entry: JournalEntry) {
  return repository.save(
    { ...entry, title: entry.title.trim() || '未命名日志' },
    id,
  );
}

export function createJournalService(repository: EntityRepository<'journalEntry'>) {
  return {
    list: () => repository.list(),
    get: (id: string) => repository.get(id),
    create: () => createJournalEntry(repository),
    save: (id: string, entry: JournalEntry) => saveJournalEntry(repository, id, entry),
    remove: (id: string) => repository.remove(id),
    filter: filterJournalEntries,
    parseTags: parseJournalTags,
  };
}

export function parseJournalTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((t) => t.trim().slice(0, 40))
        .filter(Boolean),
    ),
  ).slice(0, 20);
}
