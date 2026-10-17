import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../app/ErrorBoundary';
import { useServiceQuery } from '../hooks/useServiceQuery';

const failedRead = () =>
  Promise.reject(new DOMException('IndexedDB unavailable', 'InvalidStateError'));
const service = {};

function BrokenRead() {
  useServiceQuery(failedRead, service);
  return <p>正在读取记录</p>;
}

afterEach(() => cleanup());

it('shows a recovery message when a reactive IndexedDB read fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <BrokenRead />
    </ErrorBoundary>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('暂时无法打开实验室');
  expect(screen.getByRole('button', { name: '刷新页面' })).toBeVisible();
  expect(screen.queryByText('正在读取记录')).not.toBeInTheDocument();
});
