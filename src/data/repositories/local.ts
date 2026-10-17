import type { BusinessRecord, RecordKind } from '../../domain/types';
import type { Repository } from '../repository';
import type { AssessmentRepository, EntityRepository } from './contracts';

/** Keep the existing transactional Repository as the sole local write path. */
export function localEntityRepository<K extends RecordKind>(
  source: Repository,
  kind: K,
): EntityRepository<K> {
  return {
    list: () => source.list(kind),
    get: async (id) => {
      const record = await source.get(id);
      return record?.kind === kind ? (record as BusinessRecord<K>) : undefined;
    },
    save: (payload, id) => source.save(kind, payload, id),
    remove: async (id) => {
      const record = await source.get(id);
      if (!record) return;
      if (record.kind !== kind) throw new Error('记录类型与当前功能不一致。');
      await source.remove(id);
    },
  };
}

export function localAssessmentRepository(source: Repository): AssessmentRepository {
  return {
    ...localEntityRepository(source, 'assessmentResult'),
    saveSelfAssessment: (answers, scores) => source.saveSelfAssessment(answers, scores),
  };
}
