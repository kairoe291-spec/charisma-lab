import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../data/repository';
import type { RecordKind } from '../domain/types';
export function useRecords(kind?: RecordKind) {
  return useLiveQuery(() => repository.list(kind, 'guest'), [kind], []);
}
