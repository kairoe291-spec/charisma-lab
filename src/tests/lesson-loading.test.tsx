import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LessonReader } from '../features/learning/LessonReader';
import type { BusinessRecord } from '../domain/types';

const learning = vi.hoisted(() => ({
  listProgress: vi.fn(),
  listNotes: vi.fn(),
  saveProgress: vi.fn(),
  saveNote: vi.fn(),
}));
vi.mock('../hooks/useFeatureServices', () => ({ useLearningService: () => learning }));
vi.mock('../hooks/useSaveQueue', () => ({
  useSaveQueue: () => ({
    enqueue: async (task: () => Promise<unknown>) => task(),
    state: '已保存到本机',
  }),
}));
vi.mock('../shared/feedback', () => ({ useFeedback: () => ({ notify: vi.fn() }) }));

let finishProgress: (records: BusinessRecord<'courseProgress'>[]) => void;
let finishNotes: (records: BusinessRecord<'lessonNote'>[]) => void;
beforeEach(() => {
  learning.listProgress.mockReset().mockImplementation(
    () =>
      new Promise<BusinessRecord<'courseProgress'>[]>((resolve) => {
        finishProgress = resolve;
      }),
  );
  learning.listNotes.mockReset().mockImplementation(
    () =>
      new Promise<BusinessRecord<'lessonNote'>[]>((resolve) => {
        finishNotes = resolve;
      }),
  );
  learning.saveProgress.mockReset().mockResolvedValue(undefined);
  learning.saveNote.mockReset().mockResolvedValue(undefined);
});
afterEach(() => cleanup());

it('keeps lesson editing unavailable until both saved progress and notes finish loading', async () => {
  render(
    <MemoryRouter initialEntries={['/academy/M04-L01']}>
      <Routes>
        <Route path="/academy/:lessonId" element={<LessonReader />} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(learning.listProgress).toHaveBeenCalled();
    expect(learning.listNotes).toHaveBeenCalled();
  });
  expect(screen.getByRole('status')).toHaveTextContent('正在读取课程进度与笔记');
  expect(screen.queryByLabelText('学习笔记')).not.toBeInTheDocument();
  expect(learning.saveProgress).not.toHaveBeenCalled();
  expect(learning.saveNote).not.toHaveBeenCalled();

  const base = {
    ownerScope: 'guest',
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    serverVersion: 0,
    localRevision: 1,
    syncStatus: 'local' as const,
  };
  finishProgress([
    {
      ...base,
      id: crypto.randomUUID(),
      kind: 'courseProgress',
      payload: { lessonId: 'M04-L01', stage: 3, completed: false },
    },
  ]);
  expect(screen.queryByLabelText('学习笔记')).not.toBeInTheDocument();
  finishNotes([
    {
      ...base,
      id: crypto.randomUUID(),
      kind: 'lessonNote',
      payload: { lessonId: 'M04-L01', text: '已有的课程笔记', bookmarked: true },
    },
  ]);

  const editor = await screen.findByLabelText('学习笔记');
  expect(editor).toHaveValue('已有的课程笔记');
  expect(screen.getByRole('button', { name: '已收藏' })).toBeVisible();
  expect(screen.getByText('4 / 5')).toBeVisible();
  expect(learning.saveProgress).not.toHaveBeenCalled();
  expect(learning.saveNote).not.toHaveBeenCalled();

  fireEvent.change(editor, { target: { value: '继续补充课程笔记' } });
  await waitFor(() => expect(learning.saveNote).toHaveBeenCalled());
  expect(learning.saveNote.mock.calls[0][1]).toEqual({ text: '继续补充课程笔记' });
});
