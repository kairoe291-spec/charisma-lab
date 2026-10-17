import { modules } from '../../content';
import type { AssessmentRepository } from '../../data/repositories/contracts';

// Preserve the existing 24-answer ordering and two-question average per module.
export function prepareSelfAssessment(answers: Record<number, number>) {
  const all = Array.from({ length: 24 }, (_, i) => answers[i]);
  const computed = Object.fromEntries(
    modules.map((m, i) => [m.id, (all[i * 2] + all[i * 2 + 1]) / 2]),
  );
  return { all, computed };
}

export function createAssessmentService(repository: AssessmentRepository) {
  return {
    listResults: () => repository.list(),
    submitSelfAssessment: (answers: Record<number, number>) => {
      const { all, computed } = prepareSelfAssessment(answers);
      return repository.saveSelfAssessment(all, computed);
    },
  };
}
