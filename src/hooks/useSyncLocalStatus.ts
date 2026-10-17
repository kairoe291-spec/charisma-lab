import { useLiveQuery } from 'dexie-react-hooks';
import { syncStatusRepository } from '../data/repositories/syncStatus';

export function useSyncLocalStatus(scope: string) {
  const queue = useLiveQuery(() => syncStatusRepository.listQueue(scope), [scope], []);
  const metadata = useLiveQuery(() => syncStatusRepository.getMetadata(scope), [scope]);
  const conflicts = useLiveQuery(() => syncStatusRepository.countConflicts(scope), [scope], 0);
  return { queue, metadata, conflicts };
}
