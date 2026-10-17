import { describe, expect, it } from 'vitest';
import {
  getLesson,
  getLessons,
  getModules,
  getQuestions,
  getScenarios,
  getTasks,
  growthPlan,
  learningStages,
  lessons,
  modules,
  scenarios,
  selfAssessmentQuestions,
  trainings,
} from '../content';
import { MODULE_IDS } from '../domain/validation';

describe('curriculum integrity', () => {
  it('assembles existing lessons and questions by stable IDs through the content loader', () => {
    expect(getModules()).toEqual(modules);
    expect(getLessons()).toEqual(lessons);
    expect(getLessons('M04').map((lesson) => lesson.id)).toEqual(['M04-L01', 'M04-L02', 'M04-L03']);
    expect(getLessons('M01')).toEqual([]);
    expect(getLesson('M04-L01')?.quiz.map((question) => question.id)).toEqual([
      'M04-Q01',
      'M04-Q02',
      'M04-Q03',
    ]);
    expect(getLesson('M04-L02')?.quiz.map((question) => question.id)).toEqual([
      'M04-Q04',
      'M04-Q05',
      'M04-Q06',
    ]);
    expect(getLesson('M04-L03')?.quiz.map((question) => question.id)).toEqual([
      'M04-Q07',
      'M04-Q08',
      'M04-Q09',
    ]);
    expect(getLesson('missing')).toBeUndefined();
    expect(getQuestions()).toHaveLength(9);
    expect(getQuestions('M04-L01')).toHaveLength(3);
    expect(getQuestions().every((question) => getLesson(question.lessonId))).toBe(true);
    expect(getTasks('M04')).toEqual(trainings);
    expect(getScenarios('M04')).toEqual(scenarios);
    expect(getTasks('M01')).toEqual([]);
    expect(learningStages.map((stage) => stage.label)).toEqual([
      '认识概念',
      '案例解析',
      '场景模拟',
      '现实训练',
      '测试与复盘',
    ]);
    expect(growthPlan.map((phase) => phase.day)).toEqual([
      'DAY 01—07',
      'DAY 08—30',
      'DAY 31—60',
      'DAY 61—90',
    ]);
  });

  it('has twelve distinct module directories, without pretending planned courses are published', () => {
    expect(modules).toHaveLength(12);
    expect(new Set(modules.map((module) => module.id)).size).toBe(12);
    expect(modules.map((module) => module.id).sort()).toEqual(
      Array.from({ length: 12 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`),
    );
    for (const module of modules) {
      expect(module.title.length).toBeGreaterThan(0);
      expect(module.topics.length).toBeGreaterThan(0);
      expect(module.plannedLessons.length).toBeGreaterThanOrEqual(3);
    }
    expect(lessons.filter((lesson) => lesson.moduleId === 'M04').length).toBeGreaterThanOrEqual(3);
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(lessons.length);
  });

  it('published lessons have substantive learning, cases, practice and answerable quizzes', () => {
    const quizIds: string[] = [];
    for (const lesson of lessons) {
      expect(modules.some((module) => module.id === lesson.moduleId)).toBe(true);
      expect(lesson.minutes).toBeGreaterThan(0);
      expect(lesson.objectives.length).toBeGreaterThan(0);
      expect(lesson.concepts.length).toBeGreaterThan(0);
      expect(lesson.cases.length).toBeGreaterThan(0);
      expect(lesson.mistakes.length).toBeGreaterThan(0);
      expect(lesson.practice.length).toBeGreaterThan(0);
      expect(lesson.quiz.length).toBeGreaterThan(0);
      for (const item of lesson.concepts) expect(item.body.trim().length).toBeGreaterThan(40);
      for (const item of lesson.cases) {
        expect(item.before).not.toBe(item.after);
        expect(item.analysis.trim().length).toBeGreaterThan(20);
      }
      for (const question of lesson.quiz) {
        quizIds.push(question.id);
        expect(question.options.length).toBeGreaterThanOrEqual(2);
        expect(new Set(question.options).size).toBe(question.options.length);
        expect(Number.isInteger(question.answer)).toBe(true);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.trim().length).toBeGreaterThan(10);
      }
      expect(scenarios.some((scenario) => scenario.moduleId === lesson.moduleId)).toBe(true);
      expect(trainings.some((training) => training.moduleId === lesson.moduleId)).toBe(true);
    }
    expect(new Set(quizIds).size).toBe(quizIds.length);
  });

  it('training offers all three supported durations with usable steps and valid references', () => {
    expect(new Set(trainings.map((training) => training.id)).size).toBe(trainings.length);
    expect(new Set(trainings.map((training) => training.minutes))).toEqual(new Set([5, 15, 30]));
    for (const training of trainings) {
      expect(modules.some((module) => module.id === training.moduleId)).toBe(true);
      expect(training.steps.length).toBeGreaterThanOrEqual(2);
      expect(training.steps.every((step) => step.trim().length > 10)).toBe(true);
    }
  });

  it('scenario branches have no broken links or unreachable content, and reach a conclusion', () => {
    expect(scenarios.length).toBeGreaterThanOrEqual(2);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(scenarios.length);
    for (const scenario of scenarios) {
      expect(modules.some((module) => module.id === scenario.moduleId)).toBe(true);
      const byId = new Map(scenario.nodes.map((node) => [node.id, node]));
      expect(byId.size).toBe(scenario.nodes.length);
      expect(scenario.nodes[0].options.length).toBeGreaterThanOrEqual(2);
      for (const node of scenario.nodes) {
        expect(node.dialogue.trim().length).toBeGreaterThan(0);
        for (const option of node.options) {
          expect(option.text.trim().length).toBeGreaterThan(0);
          expect(option.feedback.trim().length).toBeGreaterThan(10);
          expect(option.alternative.trim().length).toBeGreaterThan(0);
          if (option.next)
            expect(byId.has(option.next), `${scenario.id}: ${option.next}`).toBe(true);
        }
      }
      const visited = new Set<string>();
      let hasTerminal = false;
      const visit = (id: string) => {
        if (visited.has(id)) return;
        visited.add(id);
        const node = byId.get(id)!;
        if (!node.options.length || node.options.some((option) => !option.next)) hasTerminal = true;
        for (const option of node.options) if (option.next) visit(option.next);
      };
      visit(scenario.nodes[0].id);
      expect(visited.size).toBe(byId.size);
      expect(hasTerminal).toBe(true);
    }
  });

  it('the initial self-assessment covers all twelve dimensions exactly twice', () => {
    expect(selfAssessmentQuestions).toHaveLength(24);
    expect(new Set(selfAssessmentQuestions.map((question) => question.question)).size).toBe(24);
    // The persistence validator averages each adjacent question pair by this order.
    expect(selfAssessmentQuestions.map((question) => question.moduleId)).toEqual(
      MODULE_IDS.flatMap((id) => [id, id]),
    );
    for (const module of modules) {
      expect(
        selfAssessmentQuestions.filter((question) => question.moduleId === module.id),
      ).toHaveLength(2);
    }
  });
});
