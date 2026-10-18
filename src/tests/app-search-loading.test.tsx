import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../app/App';
import type { BusinessRecord, RecordKind } from '../domain/types';

const repository = vi.hoisted(() => ({ list: vi.fn() }));
const profileService = vi.hoisted(() => ({ listProfiles: vi.fn() }));
vi.mock('../hooks/useRepository', () => ({ useRepository: () => repository }));
vi.mock('../hooks/useFeatureServices', () => ({ useProfileService: () => profileService }));
vi.mock('../cloud/context', () => ({ useCloud: () => ({ scope: 'guest', user: null }) }));
vi.mock('../app/SyncProvider', () => ({
  useSync: () => ({ pending: 0, conflicts: 0, running: false, error: null, lastSuccessAt: null }),
}));
vi.mock('../app/context', () => ({ useFeedback: () => ({ notify: vi.fn() }) }));
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [false],
    needRefresh: [false],
    updateServiceWorker: vi.fn(),
  }),
}));
vi.mock('../pages/Academy', () => ({ default: () => <p>学院页面</p> }));
vi.mock('../components/GuestMigration', () => ({ GuestMigration: () => null }));
vi.mock('../app/Onboarding', () => ({ Onboarding: () => null }));

let finishJournalRead: (records: BusinessRecord[]) => void;
beforeEach(() => {
  repository.list.mockReset().mockImplementation((kind?: RecordKind) =>
    kind === 'journalEntry'
      ? new Promise<BusinessRecord[]>((resolve) => {
          finishJournalRead = resolve;
        })
      : Promise.resolve([]),
  );
  profileService.listProfiles
    .mockReset()
    .mockResolvedValue([{ id: crypto.randomUUID(), payload: { name: '测试者' } }]);
});
afterEach(() => cleanup());

it('waits for private journal results before showing a global-search empty state', async () => {
  render(
    <MemoryRouter initialEntries={['/academy']}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('全局搜索'), { target: { value: '只属于我的复盘' } });
  await waitFor(() => expect(repository.list).toHaveBeenCalledWith('journalEntry'));
  expect(screen.getByRole('status')).toHaveTextContent('正在读取日志');
  expect(screen.queryByText('没有找到匹配内容')).not.toBeInTheDocument();

  finishJournalRead([
    {
      id: crypto.randomUUID(),
      kind: 'journalEntry',
      ownerScope: 'guest',
      createdAt: '2026-10-18T00:00:00.000Z',
      updatedAt: '2026-10-18T00:00:00.000Z',
      serverVersion: 0,
      localRevision: 1,
      syncStatus: 'local',
      payload: {
        title: '只属于我的复盘',
        body: '私人内容',
        tags: [],
        category: '每日成长',
        date: '2026-10-18',
      },
    },
  ]);
  expect(await screen.findByRole('link', { name: /只属于我的复盘/ })).toBeVisible();
  expect(screen.queryByText('没有找到匹配内容')).not.toBeInTheDocument();
});

it('shows the existing empty message only after a successful search read', async () => {
  render(
    <MemoryRouter initialEntries={['/academy']}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('全局搜索'), { target: { value: '不存在的私人日志' } });
  await waitFor(() => expect(repository.list).toHaveBeenCalledWith('journalEntry'));
  finishJournalRead([]);
  expect(await screen.findByText('没有找到匹配内容')).toBeVisible();
});
