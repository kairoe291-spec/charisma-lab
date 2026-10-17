import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useCloud } from '../cloud/context';
import { SupabaseTransport } from '../cloud/transport';
import { useSyncLocalStatus } from '../hooks/useSyncLocalStatus';
import { SyncEngine } from '../sync/engine';
import type { SyncState } from '../sync/protocol';
import { flushAllSaves } from './saveCoordinator';

const empty: SyncState = { running: false, pending: 0, conflicts: 0, authRequired: false };
const Context = createContext<
  SyncState & { runSync: (options?: { skipFlush?: boolean }) => Promise<void> }
>({
  ...empty,
  runSync: async () => {},
});
const syncErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '同步遇到问题，本地数据仍然保留。';

export function SyncProvider({ children }: { children: ReactNode }) {
  const cloud = useCloud();
  const [state, setState] = useState<SyncState>(empty);
  const engine = useRef<SyncEngine | null>(null);
  const { queue, metadata, conflicts } = useSyncLocalStatus(cloud.scope);
  const userId = cloud.user?.id;
  useEffect(() => {
    if (!cloud.client || !userId) return;
    let current = true;
    const isCurrent = () => current;
    const transport = new SupabaseTransport(cloud.client, {
      userId,
      scope: cloud.scope,
      isCurrent,
    });
    const instance = new SyncEngine({
      transport,
      scope: cloud.scope,
      userId,
      isCurrent,
      onState: (next) => {
        if (current) setState(next);
      },
    });
    engine.current = instance;
    const trigger = () => {
      if (!navigator.onLine || document.visibilityState === 'hidden') return;
      void instance.run().catch((error) => {
        if (current)
          setState((s) => ({
            ...s,
            running: false,
            error: syncErrorMessage(error),
          }));
      });
    };
    trigger();
    addEventListener('online', trigger);
    addEventListener('focus', trigger);
    document.addEventListener('visibilitychange', trigger);
    const timer = setInterval(trigger, 30_000);
    return () => {
      current = false;
      instance.stop();
      if (engine.current === instance) engine.current = null;
      clearInterval(timer);
      removeEventListener('online', trigger);
      removeEventListener('focus', trigger);
      document.removeEventListener('visibilitychange', trigger);
    };
  }, [cloud.client, cloud.scope, cloud.sessionEpoch, userId]);
  // Debounce committed local changes; retries remain scheduled by the persisted queue.
  const fingerprint = queue.map((q) => `${q.mutationId}:${q.localRevision}:${q.status}`).join('|');
  useEffect(() => {
    if (!userId || !navigator.onLine) return;
    const timer = setTimeout(() => {
      const instance = engine.current;
      void instance?.run().catch((error) => {
        if (engine.current === instance)
          setState((current) => ({ ...current, running: false, error: syncErrorMessage(error) }));
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [fingerprint, userId]);
  // A tracked UI action must flush before it starts; otherwise it would await itself.
  const runSync = useCallback(async ({ skipFlush = false }: { skipFlush?: boolean } = {}) => {
    if (!skipFlush && !(await flushAllSaves()))
      throw new Error('还有未保存的编辑，请先重试本机保存。');
    if (!navigator.onLine) throw new Error('当前离线，记录保留在本机，联网后会重试。');
    const result = await engine.current?.run({ force: true });
    if (result?.error) throw new Error(result.error);
  }, []);
  return (
    <Context.Provider
      value={{
        ...state,
        pending: queue.length,
        conflicts,
        lastSuccessAt: metadata?.lastSuccessAt ?? state.lastSuccessAt,
        error: metadata?.lastError || state.error,
        runSync,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useSync() {
  return useContext(Context);
}
