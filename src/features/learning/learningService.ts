import type { Repository } from '../../data/repository';
import type { CourseProgress, LessonNote } from '../../types';

// Called inside the existing save queue. Preserve the original read/merge/write
// order and delegate atomic persistence to the unchanged Repository.
export async function saveLessonProgress(
  repository: Repository,
  lessonId: string,
  patch: Partial<CourseProgress>,
  fallbackId: string,
) {
  const saved = (await repository.list('courseProgress')).find(
    (record) => record.payload.lessonId === lessonId,
  );
  return repository.save(
    'courseProgress',
    { lessonId, stage: 0, completed: false, ...saved?.payload, ...patch },
    saved?.id ?? fallbackId,
  );
}

export async function saveLessonNote(
  repository: Repository,
  lessonId: string,
  patch: Partial<LessonNote>,
  fallbackId: string,
  activeNoteId: string | null,
  toggleBookmark = false,
) {
  const available = await repository.list('lessonNote');
  const saved = activeNoteId
    ? available.find((record) => record.id === activeNoteId)
    : available.find((record) => record.payload.lessonId === lessonId);
  const payload = { lessonId, text: '', bookmarked: false, ...saved?.payload, ...patch };
  if (toggleBookmark) payload.bookmarked = !payload.bookmarked;
  return repository.save('lessonNote', payload, saved?.id ?? fallbackId);
}
