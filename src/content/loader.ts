import { modules } from './modules';
import { lessonContents } from './lessons';
import { questions } from './questions';
import { trainings } from './trainings';
import { scenarios } from './scenarios';
import type { Lesson, Module, Question, Scenario, Task } from './types';

// Static teaching data is bundled with the app. Assemble lesson models once so
// existing progress and notes continue to refer to the same stable lesson IDs.
const questionsByLesson = new Map<string, Question[]>();
for (const question of questions) {
  const list = questionsByLesson.get(question.lessonId) ?? [];
  list.push(question);
  questionsByLesson.set(question.lessonId, list);
}

const lessons: Lesson[] = lessonContents.map((content) => ({
  ...content,
  quiz: (questionsByLesson.get(content.id) ?? []).map(
    ({ id, question, options, answer, explanation }) => ({
      id,
      question,
      options,
      answer,
      explanation,
    }),
  ),
}));

export function getModules(): Module[] {
  return modules;
}

export function getModule(id: string): Module | undefined {
  return modules.find((module) => module.id === id);
}

export function getLessons(moduleId?: string): Lesson[] {
  return moduleId ? lessons.filter((lesson) => lesson.moduleId === moduleId) : lessons;
}

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((lesson) => lesson.id === id);
}

export function getQuestions(lessonId?: string): Question[] {
  return lessonId ? (questionsByLesson.get(lessonId) ?? []) : questions;
}

export function getTasks(moduleId?: string): Task[] {
  return moduleId ? trainings.filter((task) => task.moduleId === moduleId) : trainings;
}

export function getScenarios(moduleId?: string): Scenario[] {
  return moduleId ? scenarios.filter((scenario) => scenario.moduleId === moduleId) : scenarios;
}

// Keep the existing static-content imports available to other consumers.
export { modules, lessons, trainings, scenarios, questions };
