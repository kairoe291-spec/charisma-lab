export interface Profile {
  name: string;
  focus: string[];
  dailyMinutes: number;
  weeklyDays: number;
  scene: string;
  goal: string;
  startDate: string;
}
export interface Progress {
  lessonId: string;
  stage: number;
  completed: boolean;
  quizScore?: number;
}
export interface Note {
  lessonId: string;
  text: string;
  bookmarked: boolean;
}
export interface TrainingRecord {
  taskId: string;
  title: string;
  moduleId: string;
  minutes: number;
  date: string;
  difficulty: string;
  reflection: string;
  completed: boolean;
}
export interface Journal {
  title: string;
  body: string;
  tags: string[];
  category: string;
  date: string;
}
export interface Evaluation {
  scores: Record<string, number>;
}
