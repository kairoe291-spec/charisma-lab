import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CharismaDatabase } from '../data/database';
import { Repository } from '../data/repository';
import { localAssessmentRepository, localEntityRepository } from '../data/repositories/local';
import { createAssessmentService } from '../features/assessment/assessmentService';
import { createJournalService } from '../features/journal/journalService';
import { createLearningService } from '../features/learning/learningService';
import { createTrainingService } from '../features/training/trainingService';
import { createProfileService } from '../features/profile/profileService';
import { createDataManagementService } from '../services/dataManagementService';

let database: CharismaDatabase;
let repository: Repository;

beforeEach(() => {
  database = new CharismaDatabase(`charisma-service-test-${crypto.randomUUID()}`);
  repository = new Repository(database);
});

afterEach(async () => {
  await database.delete();
});

describe('feature services through the local repository', () => {
  it('creates, reads, updates and soft-deletes a private journal', async () => {
    const journal = createJournalService(localEntityRepository(repository, 'journalEntry'));
    const created = await journal.create();
    expect((await journal.get(created.id))?.payload.title).toBe('未命名日志');
    const updated = await journal.save(created.id, {
      ...created.payload,
      title: '  今天的收获  ',
      body: '我认真倾听了朋友。',
    });
    expect(updated.id).toBe(created.id);
    expect((await journal.list())[0].payload.title).toBe('今天的收获');
    expect((await journal.get(created.id))?.payload.body).toBe('我认真倾听了朋友。');
    await journal.remove(created.id);
    expect(await journal.get(created.id)).toBeUndefined();
    expect(await journal.list()).toHaveLength(0);
    expect((await database.records.get(['guest', created.id]))?.deletedAt).toBeTruthy();
  });

  it('does not let a feature delete another kind of record with a valid ID', async () => {
    const profile = await repository.save('profile', {
      name: '学习者', focus: ['M04', 'M06', 'M08'], dailyMinutes: 15,
      weeklyDays: 5, scene: '校园交流', goal: '练习表达', startDate: '2026-10-17',
    });
    const journals = localEntityRepository(repository, 'journalEntry');
    expect(await journals.get(profile.id)).toBeUndefined();
    await expect(journals.remove(profile.id)).rejects.toThrow('类型');
    expect((await repository.get(profile.id))?.kind).toBe('profile');
  });

  it('creates and updates a training record through the service', async () => {
    const training = createTrainingService(
      localEntityRepository(repository, 'trainingRecord'),
      localEntityRepository(repository, 'trainingTask'),
    );
    const task = await training.createTask({
      title: '一分钟表达', description: '说清一件事', minutes: 5, moduleId: 'M04',
    });
    expect((await training.listTasks())[0].id).toBe(task.id);
    const selected = training.getTasks([task]).find((item) => item.id === task.id)!;
    const saved = await training.record(selected, {
      date: '2026-10-17', difficulty: '入门', reflection: '说清了重点',
    });
    expect((await training.listRecords())[0].id).toBe(saved.id);
    await training.updateRecord(saved.id, { ...saved.payload, reflection: '下次尝试更慢的语速' });
    database.close();
    await database.open();
    expect((await training.listRecords())[0].payload.reflection).toBe('下次尝试更慢的语速');
  });

  it('saves and reads lesson progress and notes after reopening IndexedDB', async () => {
    const learning = createLearningService(
      localEntityRepository(repository, 'courseProgress'),
      localEntityRepository(repository, 'lessonNote'),
    );
    const progressId = crypto.randomUUID();
    const noteId = crypto.randomUUID();
    await learning.saveProgress('M04-L01', { stage: 2 }, progressId);
    await learning.saveProgress('M04-L01', { stage: 4, completed: true }, progressId);
    await learning.saveNote('M04-L01', { text: '先说结论' }, noteId, null);
    database.close();
    await database.open();
    expect(await learning.listProgress()).toMatchObject([
      { id: progressId, payload: { lessonId: 'M04-L01', stage: 4, completed: true } },
    ]);
    expect(await learning.listNotes()).toMatchObject([
      { id: noteId, payload: { lessonId: 'M04-L01', text: '先说结论' } },
    ]);
  });

  it('saves a profile and restores it after reopening the existing local database', async () => {
    const profile = createProfileService(
      localEntityRepository(repository, 'profile'),
      localEntityRepository(repository, 'userInterest'),
      localEntityRepository(repository, 'growthGoal'),
      localEntityRepository(repository, 'journalEntry'),
    );
    const saved = await profile.saveProfile({
      name: '学习者', focus: ['M04', 'M06', 'M08'], dailyMinutes: 15,
      weeklyDays: 5, scene: '小组讨论', goal: '从容表达', startDate: '2026-10-17',
    });
    database.close();
    await database.open();
    expect((await profile.listProfiles())[0].id).toBe(saved.id);
    expect((await profile.listProfiles())[0].payload.goal).toBe('从容表达');
    expect(await repository.countOutbox()).toBe(1);
  });

  it('saves a self-assessment and reads its persisted result', async () => {
    const assessment = createAssessmentService(localAssessmentRepository(repository));
    const answers = Object.fromEntries(Array.from({ length: 24 }, (_, index) => [index, 3]));
    const saved = await assessment.submitSelfAssessment(answers);
    expect(saved.assessment.payload.type).toBe('initial-self');
    expect((await assessment.listResults())[0].id).toBe(saved.assessment.id);
    expect(await repository.list('selfEvaluation')).toHaveLength(1);
    expect(await repository.countOutbox()).toBe(2);
  });

  it('keeps settings and backup operations on the existing local repository', async () => {
    const settings = createDataManagementService(
      repository, localEntityRepository(repository, 'appSettings'),
    );
    const saved = await settings.saveTheme('warm');
    const backup = settings.previewBackup(JSON.stringify(await settings.exportBackup()));
    expect(backup.records.find((record) => record.id === saved.id)?.payload).toEqual({ theme: 'warm' });
    expect(await repository.countOutbox()).toBe(1);
  });
});
