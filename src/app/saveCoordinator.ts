/** Keep saves alive across route changes; failed jobs remain available to retry. */
export interface SaveGroup {
  jobs: Array<{ task: () => Promise<unknown>; complete: (saved: boolean) => void }>;
  running: Promise<void> | null;
  failed: boolean;
  state: string;
  listeners: Set<(state: string) => void>;
}
const groups = new Set<SaveGroup>();
const operations = new Set<Promise<unknown>>();
const listeners = new Set<() => void>();
export function createSaveGroup(): SaveGroup {
  return { jobs: [], running: null, failed: false, state: '已保存到本机', listeners: new Set() };
}
function emit(group: SaveGroup, state: string) {
  group.state = state;
  group.listeners.forEach((listener) => listener(state));
  listeners.forEach((listener) => listener());
}
function drain(group: SaveGroup): Promise<void> {
  if (group.running) return group.running;
  if (!group.jobs.length) return Promise.resolve();
  group.failed = false;
  emit(group, '正在保存…');
  group.running = (async () => {
    while (group.jobs.length) {
      const job = group.jobs[0];
      try {
        await job.task();
        group.jobs.shift();
      } catch {
        group.failed = true;
        group.running = null;
        emit(group, '保存失败，请点击重试保存');
        job.complete(false);
        return;
      }
      // Publish completion only after bookkeeping. A caller can immediately
      // enqueue again when its promise resolves, including after unmount.
      if (!group.jobs.length) {
        group.running = null;
        groups.delete(group);
        emit(group, '已保存到本机');
        job.complete(true);
        return;
      }
      job.complete(true);
    }
  })();
  return group.running;
}
export function enqueueSave(group: SaveGroup, task: () => Promise<unknown>) {
  groups.add(group);
  const completion = new Promise<boolean>((complete) => group.jobs.push({ task, complete }));
  void drain(group);
  return completion;
}
export function hasUnsavedChanges() {
  return groups.size > 0 || operations.size > 0;
}
export function hasFailedSaves() {
  return [...groups].some((group) => group.failed);
}
export function subscribeSaves(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export async function flushAllSaves() {
  const results = await Promise.allSettled([
    ...operations,
    ...[...groups].map((group) => group.running ?? drain(group)),
  ]);
  return results.every((result) => result.status === 'fulfilled') && !hasUnsavedChanges();
}
/** Explicit form submissions/deletions also need unload protection while saving. */
export function trackOperation<T>(task: () => Promise<T>): Promise<T> {
  const pending = Promise.resolve().then(task);
  const tracked = pending.then(
    (value) => {
      operations.delete(tracked);
      return value;
    },
    (error: unknown) => {
      operations.delete(tracked);
      throw error;
    },
  );
  operations.add(tracked);
  return tracked;
}
