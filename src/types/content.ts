export interface Module {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  topics: string[];
  color: string;
  plannedLessons: string[];
}
export interface Question {
  id: string;
  lessonId: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}
export type QuizQuestion = Omit<Question, 'lessonId'>;
export interface LessonContent {
  id: string;
  moduleId: string;
  title: string;
  subtitle: string;
  minutes: number;
  objectives: string[];
  concepts: { title: string; body: string }[];
  cases: { title: string; before: string; after: string; analysis: string }[];
  mistakes: string[];
  practice: string[];
}
export interface Lesson extends LessonContent {
  quiz: QuizQuestion[];
}
export interface Task {
  id: string;
  moduleId: string;
  title: string;
  minutes: number;
  difficulty: string;
  description: string;
  steps: string[];
}
export interface PublishedTask extends Task {
  minutes: 5 | 15 | 30;
}
export type Training = Task;
export interface Scenario {
  id: string;
  moduleId: string;
  title: string;
  background: string;
  nodes: {
    id: string;
    dialogue: string;
    options: { text: string; feedback: string; alternative: string; next?: string }[];
  }[];
}
