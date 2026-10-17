import type { Repository } from '../data/repository';
import type { RecordKind } from '../domain/types';

/** Shared read flow for dashboard and cross-feature summaries. */
export function createRecordQueryService(repository: Pick<Repository, 'list'>) {
  return {
    list: (kind?: RecordKind) => repository.list(kind),
  };
}
