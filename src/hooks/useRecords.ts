import { useLiveQuery } from 'dexie-react-hooks';
import { useRepository } from './useRepository';
import type { BusinessRecord, RecordKind } from '../types';
export function useRecords<K extends RecordKind>(kind: K): BusinessRecord<K>[];
export function useRecords(): BusinessRecord[];
export function useRecords(kind?: RecordKind) {
  const repository = useRepository();
  return useLiveQuery(() => repository.list(kind), [kind, repository], []);
}
