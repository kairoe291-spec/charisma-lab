import type { Repository } from '../../data/repository';
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

export function createJournalEntry(repository: Repository) {
  return repository.save('journalEntry', {
    title: '未命名日志',
    body: '',
    tags: [],
    category: '每日成长',
    date: today(),
  });
}

export function saveJournalEntry(repository: Repository, id: string, entry: JournalEntry) {
  return repository.save(
    'journalEntry',
    { ...entry, title: entry.title.trim() || '未命名日志' },
    id,
  );
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
