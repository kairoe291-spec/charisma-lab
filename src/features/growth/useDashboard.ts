import { modules, lessons } from '../../content';
import { useRecordsState } from '../../hooks/useRecords';
import type {
  UserProfile as Profile,
  CourseProgress as Progress,
  TrainingRecord,
  SelfEvaluation as Evaluation,
} from '../../types';
import { today } from '../../utils/files';

export function useDashboard(
  profile: Profile | undefined,
  radarMode: 'self' | 'knowledge' | 'practice',
) {
  const { data: allProgress, loading: progressLoading } = useRecordsState('courseProgress');
  // Backup merges may preserve older copies. Count each active course once.
  const progress = allProgress.filter(
    (record, index) =>
      lessons.some((lesson) => lesson.id === (record.payload as Progress).lessonId) &&
      allProgress.findIndex(
        (candidate) =>
          (candidate.payload as Progress).lessonId === (record.payload as Progress).lessonId,
      ) === index,
  );
  const { data: training, loading: trainingLoading } = useRecordsState('trainingRecord');
  const { data: journals, loading: journalsLoading } = useRecordsState('journalEntry');
  const { data: evaluations, loading: evaluationsLoading } = useRecordsState('selfEvaluation');
  const { data: assessments, loading: assessmentsLoading } = useRecordsState('assessmentResult');
  const complete = progress.filter((r) => (r.payload as Progress).completed).length;
  const records = training.map((r) => r.payload as TrainingRecord).filter((r) => r.completed);
  const todayTasks = records.filter((r) => r.date === today());
  const minutes = records.reduce((a, r) => a + r.minutes, 0);
  const latest = evaluations[0]?.payload as Evaluation | undefined;
  const radar = modules.map((m) => {
    const ps = progress
      .map((r) => r.payload as Progress)
      .filter(
        (p) =>
          lessons.find((l) => l.id === p.lessonId)?.moduleId === m.id && p.quizScore !== undefined,
      );
    return {
      name: m.shortTitle,
      value:
        radarMode === 'self'
          ? (latest?.scores[m.id] ?? 0) * 20
          : radarMode === 'knowledge'
            ? ps.length
              ? ps.reduce((a, p) => a + (p.quizScore ?? 0), 0) / ps.length
              : 0
            : Math.min(100, (records.filter((r) => r.moduleId === m.id).length / 3) * 100),
    };
  });
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      day: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
      分钟: records.filter((r) => r.date === date).reduce((a, r) => a + r.minutes, 0),
    };
  });
  const dates = new Set(records.map((record) => record.date));
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(today())) cursor.setDate(cursor.getDate() - 1);
  while (
    dates.has(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`,
    )
  ) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const next =
    lessons.find(
      (l) =>
        !progress.some(
          (p) => (p.payload as Progress).lessonId === l.id && (p.payload as Progress).completed,
        ),
    ) ?? lessons[0];
  const focus = profile?.focus ?? ['M04', 'M06', 'M08'];
  return {
    loading:
      progressLoading ||
      trainingLoading ||
      journalsLoading ||
      evaluationsLoading ||
      assessmentsLoading,
    complete,
    records,
    todayTasks,
    minutes,
    latest,
    radar,
    week,
    streak,
    next,
    focus,
    journals,
    assessments,
  };
}
