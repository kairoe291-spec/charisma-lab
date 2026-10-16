import { trainings } from '../../content';
import type { Repository } from '../../data/repository';
import type { BusinessRecord, Training, TrainingRecord } from '../../types';

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
  repository: Repository,
  task: Training,
  entry: Pick<TrainingRecord, 'date' | 'difficulty' | 'reflection'>,
) {
  return repository.save('trainingRecord', {
    taskId: task.id,
    title: task.title,
    moduleId: task.moduleId,
    minutes: task.minutes,
    ...entry,
    completed: true,
  });
}
