import type { BusinessRecord, RecordKind, RecordPayloads } from '../../domain/types';

/** A feature's local data port. Services depend on this contract, not Dexie. */
export interface EntityRepository<K extends RecordKind> {
  list(): Promise<BusinessRecord<K>[]>;
  get(id: string): Promise<BusinessRecord<K> | undefined>;
  save(payload: RecordPayloads[K], id?: string): Promise<BusinessRecord<K>>;
  remove(id: string): Promise<void>;
}

export interface AssessmentRepository extends EntityRepository<'assessmentResult'> {
  saveSelfAssessment(
    answers: number[],
    scores: Record<string, number>,
  ): Promise<{
    assessment: BusinessRecord<'assessmentResult'>;
    evaluation: BusinessRecord<'selfEvaluation'>;
  }>;
}
