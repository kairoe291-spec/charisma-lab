import { trainings } from '../../content';
import type { EntityRepository } from '../../data/repositories/contracts';
import type { BusinessRecord, RecordPayloads, Training, TrainingRecord } from '../../types';

export function getTrainingTasks(tasks: BusinessRecord<'trainingTask'>[]): Training[] {
  return [
    ...trainings,
    ...tasks.map((t) => ({
      id: t.id,
      ...(t.payload as {
        title: string;
        minutes: 5 | 15 | 30;
        moduleId: string;
        description: string;
      }),
      difficulty: '自主练习',
      steps: ['在合适的环境中进行练习。', '完成后记录真实体验与下一次的调整。'],
    })),
  ];
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
    updateRecord: (id: string, payload: RecordPayloads['trainingRecord']) => records.save(payload, id),
    removeRecord: (id: string) => records.remove(id),
  };
}
