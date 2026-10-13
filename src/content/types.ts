export interface Module {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  topics: string[];
  color: string;
  plannedLessons: string[];
}
export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}
export interface Lesson {
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
  quiz: QuizQuestion[];
}
export interface Training {
  id: string;
  moduleId: string;
  title: string;
  minutes: 5 | 15 | 30;
  difficulty: string;
  description: string;
  steps: string[];
}
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
