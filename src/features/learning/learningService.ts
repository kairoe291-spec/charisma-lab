import type { EntityRepository } from '../../data/repositories/contracts';
import type { RecordPayloads } from '../../domain/types';
import type { CourseProgress, LessonNote } from '../../types';

// Called inside the existing save queue. Preserve the original read/merge/write
// order and delegate atomic persistence to the unchanged Repository.
export async function saveLessonProgress(
  repository: EntityRepository<'courseProgress'>,
  lessonId: string,
  patch: Partial<CourseProgress>,
  fallbackId: string,
) {
  const saved = (await repository.list()).find(
    (record) => record.payload.lessonId === lessonId,
  );
  return repository.save(
    { lessonId, stage: 0, completed: false, ...saved?.payload, ...patch },
    saved?.id ?? fallbackId,
  );
}

export async function saveLessonNote(
  repository: EntityRepository<'lessonNote'>,
  lessonId: string,
  patch: Partial<LessonNote>,
  fallbackId: string,
  activeNoteId: string | null,
  toggleBookmark = false,
) {
  const available = await repository.list();
  const saved = activeNoteId
    ? available.find((record) => record.id === activeNoteId)
    : available.find((record) => record.payload.lessonId === lessonId);
  const payload = { lessonId, text: '', bookmarked: false, ...saved?.payload, ...patch };
  if (toggleBookmark) payload.bookmarked = !payload.bookmarked;
  return repository.save(payload, saved?.id ?? fallbackId);
}

export function createLearningService(
  progress: EntityRepository<'courseProgress'>,
  notes: EntityRepository<'lessonNote'>,
) {
  return {
    listProgress: () => progress.list(),
    listNotes: () => notes.list(),
    saveProgress: (lessonId: string, patch: Partial<CourseProgress>, fallbackId: string) =>
      saveLessonProgress(progress, lessonId, patch, fallbackId),
    saveNote: (
      lessonId: string, patch: Partial<LessonNote>, fallbackId: string,
      activeNoteId: string | null, toggleBookmark = false,
    ) => saveLessonNote(notes, lessonId, patch, fallbackId, activeNoteId, toggleBookmark),
  };
}

export function createScenarioService(attempts: EntityRepository<'scenarioAttempt'>) {
  return {
    listAttempts: () => attempts.list(),
    saveAttempt: (payload: RecordPayloads['scenarioAttempt']) => attempts.save(payload),
  };
}
