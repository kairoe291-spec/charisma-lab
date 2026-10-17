import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRepository } from './useRepository';
import type { BusinessRecord, RecordKind } from '../types';
import { createRecordQueryService } from '../services/recordQueryService';
export function useRecords<K extends RecordKind>(kind: K): BusinessRecord<K>[];
export function useRecords(): BusinessRecord[];
export function useRecords(kind?: RecordKind) {
  const repository = useRepository();
  const service = useMemo(() => createRecordQueryService(repository), [repository]);
  return useLiveQuery(() => service.list(kind), [kind, service], []);
}
