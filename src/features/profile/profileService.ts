import type { EntityRepository } from '../../data/repositories/contracts';
import type { BusinessRecord, RecordPayloads } from '../../domain/types';
import { today } from '../../utils/files';

export function createProfileService(
  profiles: EntityRepository<'profile'>,
  interests: EntityRepository<'userInterest'>,
  goals: EntityRepository<'growthGoal'>,
  journals: EntityRepository<'journalEntry'>,
) {
  return {
    listProfiles: () => profiles.list(),
    saveProfile: (payload: RecordPayloads['profile'], id?: string) => profiles.save(payload, id),
    listInterests: () => interests.list(),
    saveInterest: (payload: RecordPayloads['userInterest'], id?: string) =>
      interests.save({ ...payload, name: payload.name.trim() }, id),
    listGoals: () => goals.list(),
    saveGoal: (payload: RecordPayloads['growthGoal'], id?: string) =>
      goals.save({ ...payload, title: payload.title.trim() }, id),
    changeGoalStatus: (record: BusinessRecord<'growthGoal'>, status: string) =>
      goals.save({ ...record.payload, status }, record.id),
    removeRecord: (record: BusinessRecord<'userInterest'> | BusinessRecord<'growthGoal'>) =>
      record.kind === 'userInterest' ? interests.remove(record.id) : goals.remove(record.id),
    saveStyleReflection: (
      values: { feeling: string; scene: string; action: string },
      id?: string,
    ) =>
      journals.save(
        {
          title: `个人风格探索 · ${today()}`,
          body: `## 我希望日常给自己的感觉\n\n${values.feeling.trim() || '暂时留白'}\n\n## 我想保留的真实场景\n\n${values.scene.trim() || '暂时留白'}\n\n## 接下来的一小步\n\n${values.action.trim() || '暂时留白'}`,
          category: '思想笔记',
          date: today(),
          tags: ['风格探索'],
        },
        id,
      ),
  };
}
