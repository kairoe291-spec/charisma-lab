import { useMemo } from 'react';
import { localAssessmentRepository, localEntityRepository } from '../data/repositories/local';
import { createAssessmentService } from '../features/assessment/assessmentService';
import { createJournalService } from '../features/journal/journalService';
import { createLearningService, createScenarioService } from '../features/learning/learningService';
import { createTrainingService } from '../features/training/trainingService';
import { createProfileService } from '../features/profile/profileService';
import { createDataManagementService } from '../services/dataManagementService';
import { useRepository } from './useRepository';

export function useJournalService() {
  const repository = useRepository();
  return useMemo(
    () => createJournalService(localEntityRepository(repository, 'journalEntry')),
    [repository],
  );
}

export function useTrainingService() {
  const repository = useRepository();
  return useMemo(
    () =>
      createTrainingService(
        localEntityRepository(repository, 'trainingRecord'),
        localEntityRepository(repository, 'trainingTask'),
      ),
    [repository],
  );
}

export function useLearningService() {
  const repository = useRepository();
  return useMemo(
    () =>
      createLearningService(
        localEntityRepository(repository, 'courseProgress'),
        localEntityRepository(repository, 'lessonNote'),
      ),
    [repository],
  );
}

export function useProfileService() {
  const repository = useRepository();
  return useMemo(
    () =>
      createProfileService(
        localEntityRepository(repository, 'profile'),
        localEntityRepository(repository, 'userInterest'),
        localEntityRepository(repository, 'growthGoal'),
        localEntityRepository(repository, 'journalEntry'),
      ),
    [repository],
  );
}

export function useAssessmentService() {
  const repository = useRepository();
  return useMemo(
    () => createAssessmentService(localAssessmentRepository(repository)),
    [repository],
  );
}

export function useScenarioService() {
  const repository = useRepository();
  return useMemo(
    () => createScenarioService(localEntityRepository(repository, 'scenarioAttempt')),
    [repository],
  );
}

export function useDataManagementService() {
  const repository = useRepository();
  return useMemo(
    () => createDataManagementService(repository, localEntityRepository(repository, 'appSettings')),
    [repository],
  );
}
