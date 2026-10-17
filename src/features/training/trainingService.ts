import { customTaskDefaults, getTasks } from '../../content';
import type { EntityRepository } from '../../data/repositories/contracts';
import type { BusinessRecord, RecordPayloads, Training, TrainingRecord } from '../../types';

export function getTrainingTasks(tasks: BusinessRecord<'trainingTask'>[]): Training[] {
  return [
    ...getTasks(),
    ...tasks.map((t) => ({
      id: t.id,
      ...t.payload,
      ...customTaskDefaults,
    })),
  ];
}

export function availableTrainingDurations(tasks: Training[]): number[] {
  return [...new Set(tasks.map((task) => task.minutes))].sort((a, b) => a - b);
}

export function saveCompletedTraining(
  repository: EntityRepository<'trainingRecord'>,
  task: Training,
  entry: Pick<TrainingRecord, 'date' | 'difficulty' | 'reflection'>,
) {
  return repository.save({
    taskId: task.id,
    title: task.title,
    moduleId: task.moduleId,
    minutes: task.minutes,
    ...entry,
    completed: true,
  });
}

export function createTrainingService(
  records: EntityRepository<'trainingRecord'>,
  tasks: EntityRepository<'trainingTask'>,
) {
  return {
    listRecords: () => records.list(),
    listTasks: () => tasks.list(),
    getTasks: getTrainingTasks,
    createTask: (payload: RecordPayloads['trainingTask']) => tasks.save(payload),
    record: (task: Training, entry: Pick<TrainingRecord, 'date' | 'difficulty' | 'reflection'>) =>
      saveCompletedTraining(records, task, entry),
    updateRecord: (id: string, payload: RecordPayloads['trainingRecord']) =>
      records.save(payload, id),
    removeRecord: (id: string) => records.remove(id),
  };
}
