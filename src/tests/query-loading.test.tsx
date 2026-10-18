import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JournalWorkspace } from '../features/journal/JournalWorkspace';
import { StatisticsExportPanel } from '../features/settings/StatisticsExportPanel';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { useRecordsState } from '../hooks/useRecords';
import { useServiceQueryState } from '../hooks/useServiceQuery';
import type { BusinessRecord } from '../domain/types';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  filter: vi.fn((records: BusinessRecord[]) => records),
}));
const repository = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../hooks/useFeatureServices', () => ({ useJournalService: () => mocks }));
vi.mock('../hooks/useRepository', () => ({ useRepository: () => repository }));
vi.mock('../shared/feedback', () => ({ useFeedback: () => ({ perform: vi.fn() }) }));

let completeRead: (records: BusinessRecord[]) => void;
beforeEach(() => {
  repository.list.mockReset().mockResolvedValue([]);
  mocks.list.mockReset();
  mocks.list.mockImplementation(
    () =>
      new Promise<BusinessRecord[]>((resolve) => {
        completeRead = resolve;
      }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function showJournal() {
  render(
    <MemoryRouter>
      <JournalWorkspace />
    </MemoryRouter>,
  );
}

it('shows loading before an empty journal read, then the true empty state', async () => {
  showJournal();
  expect(screen.getAllByRole('status')).toHaveLength(2);
  expect(screen.queryByText('还没有匹配的记录。')).not.toBeInTheDocument();
  expect(screen.queryByText('把经历，变成自己的成长')).not.toBeInTheDocument();
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  completeRead([]);
  expect(await screen.findByText('还没有匹配的记录。')).toBeVisible();
  expect(screen.getByText('把经历，变成自己的成长')).toBeVisible();
});

it('shows saved journal records after loading without a false empty state', async () => {
  showJournal();
  await waitFor(() => expect(mocks.list).toHaveBeenCalled());
  completeRead([
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
        title: '已保存的复盘',
        body: '今天认真倾听。',
        tags: [],
        category: '每日成长',
        date: '2026-10-18',
      },
    },
  ]);
  expect(await screen.findByText('已保存的复盘')).toBeVisible();
  expect(screen.queryByText('还没有匹配的记录。')).not.toBeInTheDocument();
});

it('uses the real query-state hook to block CSV export until an asynchronous read finishes', async () => {
  let finishRead: (records: BusinessRecord[]) => void = () => {};
  repository.list.mockImplementation(
    () =>
      new Promise<BusinessRecord[]>((resolve) => {
        finishRead = resolve;
      }),
  );
  render(<StatisticsExportPanel />);
  await waitFor(() => expect(repository.list).toHaveBeenCalled());
  expect(screen.getByRole('button', { name: '导出训练 CSV' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '导出自评 CSV' })).toBeDisabled();
  finishRead([]);
  expect(await screen.findByText('普通统计不包含私人日志')).toBeVisible();
  expect(screen.getByRole('button', { name: '导出训练 CSV' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '导出自评 CSV' })).toBeEnabled();
});

const failedRead = () =>
  Promise.reject(new DOMException('IndexedDB unavailable', 'InvalidStateError'));
const failedService = {};

function FailedServiceRead() {
  const { loading } = useServiceQueryState(failedRead, failedService);
  return <p>{loading ? '正在读取服务记录' : '读取成功'}</p>;
}

function FailedRecordRead() {
  const { loading } = useRecordsState('journalEntry');
  return <p>{loading ? '正在读取业务记录' : '读取成功'}</p>;
}

it('propagates a service query failure to the existing error boundary', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <FailedServiceRead />
    </ErrorBoundary>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法打开实验室');
  expect(screen.queryByText('读取成功')).not.toBeInTheDocument();
});

it('propagates a record query failure instead of treating it as an empty result', async () => {
  repository.list.mockRejectedValue(new DOMException('IndexedDB unavailable', 'InvalidStateError'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <FailedRecordRead />
    </ErrorBoundary>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法打开实验室');
  expect(screen.queryByText('读取成功')).not.toBeInTheDocument();
});
