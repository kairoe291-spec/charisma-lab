import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveQueue } from '../hooks/useSaveQueue';
import {
  createSaveGroup,
  enqueueSave,
  flushAllSaves,
  hasFailedSaves,
  hasUnsavedChanges,
  trackOperation,
} from '../app/saveCoordinator';

const pendingReleases = new Set<() => void>();
afterEach(async () => {
  cleanup();
  pendingReleases.forEach((release) => release());
  pendingReleases.clear();
  await flushAllSaves();
});
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  pendingReleases.add(resolve);
  return { promise, resolve };
}

describe('save feedback and serialization', () => {
  it('explains a storage quota failure and keeps the edit available to retry', async () => {
    const group = createSaveGroup();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Quota reached', 'QuotaExceededError'))
      .mockResolvedValue(undefined);
    expect(await enqueueSave(group, save)).toBe(false);
    expect(group.state).toContain('本机存储空间不足');
    expect(hasUnsavedChanges()).toBe(true);
    expect(await flushAllSaves()).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(group.state).toBe('已保存到本机');
  });

  it('protects an explicit delete/form transaction until it commits', async () => {
    const pending = deferred();
    const operation = trackOperation(() => pending.promise);
    expect(hasUnsavedChanges()).toBe(true);
    const flushed = flushAllSaves();
    pending.resolve();
    await operation;
    expect(await flushed).toBe(true);
    expect(hasUnsavedChanges()).toBe(false);
  });
  it('runs rapid edits serially and reports saved only after the last transaction resolves', async () => {
    const first = deferred();
    const second = deferred();
    const events: string[] = [];
    const { result } = renderHook(() => useSaveQueue());
    let firstSave!: Promise<unknown>;
    let secondSave!: Promise<unknown>;
    await act(async () => {
      firstSave = result.current.enqueue(async () => {
        events.push('first start');
        await first.promise;
        events.push('first commit');
      });
      secondSave = result.current.enqueue(async () => {
        events.push('second start');
        await second.promise;
        events.push('second commit');
      });
      await Promise.resolve();
    });
    expect(events).toEqual(['first start']);
    expect(result.current.state).toBe('正在保存…');
    await act(async () => {
      first.resolve();
      await firstSave;
    });
    expect(events).toEqual(['first start', 'first commit', 'second start']);
    expect(result.current.state).toBe('正在保存…');
    await act(async () => {
      second.resolve();
      await secondSave;
    });
    expect(events).toEqual(['first start', 'first commit', 'second start', 'second commit']);
    expect(result.current.state).toBe('已保存到本机');
  });

  it('shows failure honestly and can retry instead of leaving the queue rejected', async () => {
    const { result } = renderHook(() => useSaveQueue());
    const failingOnce = vi
      .fn()
      .mockRejectedValueOnce(new Error('storage quota'))
      .mockResolvedValue(undefined);
    await act(async () => {
      expect(await result.current.enqueue(failingOnce)).toBe(false);
    });
    expect(result.current.state).toBe('保存失败，请点击重试保存');
    expect(hasFailedSaves()).toBe(true);
    expect(hasUnsavedChanges()).toBe(true);
    const commit = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      await result.current.enqueue(commit);
    });
    expect(failingOnce).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe('已保存到本机');
  });

  it('warns before browser unload while a save has not committed', async () => {
    const pending = deferred();
    const { result, unmount } = renderHook(() => useSaveQueue());
    let save!: Promise<unknown>;
    await act(async () => {
      save = result.current.enqueue(() => pending.promise);
    });
    const beforeCommit = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeCommit);
    expect(beforeCommit.defaultPrevented).toBe(true);
    await act(async () => {
      pending.resolve();
      await save;
    });
    const afterCommit = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterCommit);
    expect(afterCommit.defaultPrevented).toBe(false);
    unmount();
  });

  it('retains an unsuccessful save across editor unmount and recovers it with global flush', async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary quota'))
      .mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() => useSaveQueue());
    await act(async () => {
      expect(await result.current.enqueue(attempt)).toBe(false);
    });
    expect(hasUnsavedChanges()).toBe(true);
    unmount();
    expect(await flushAllSaves()).toBe(true);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(hasUnsavedChanges()).toBe(false);
    expect(hasFailedSaves()).toBe(false);
  });

  it('keeps pending edits alive after unmount and flush waits for all commits', async () => {
    const pending = deferred();
    const committed: string[] = [];
    const { result, unmount } = renderHook(() => useSaveQueue());
    await act(async () => {
      void result.current.enqueue(async () => {
        await pending.promise;
        committed.push('first');
      });
      void result.current.enqueue(async () => {
        committed.push('second');
      });
    });
    unmount();
    const flushed = flushAllSaves();
    expect(hasUnsavedChanges()).toBe(true);
    expect(committed).toEqual([]);
    pending.resolve();
    expect(await flushed).toBe(true);
    expect(committed).toEqual(['first', 'second']);
    expect(hasUnsavedChanges()).toBe(false);
  });

  it.each([false, true])(
    'does not strand a job enqueued immediately after awaiting completion (initial failure: %s)',
    async (firstFails) => {
      const group = createSaveGroup();
      const first = vi.fn().mockResolvedValue(undefined);
      if (firstFails) first.mockRejectedValueOnce(new Error('temporary quota'));
      expect(await enqueueSave(group, first)).toBe(!firstFails);
      const second = vi.fn().mockResolvedValue(undefined);
      const next = enqueueSave(group, second);
      const settled = await Promise.race([
        next,
        new Promise<'stranded'>((resolve) => setTimeout(() => resolve('stranded'), 200)),
      ]);
      expect(settled).toBe(true);
      expect(second).toHaveBeenCalledTimes(1);
      expect(await flushAllSaves()).toBe(true);
    },
  );
});
