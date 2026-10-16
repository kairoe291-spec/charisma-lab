import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { trackOperation } from '../services/saveCoordinator';
const Context = createContext<{
  notify: (text: string, error?: boolean) => void;
  perform: (task: () => Promise<unknown>, message?: string) => Promise<boolean>;
}>({ notify: () => {}, perform: async () => false });
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ text: string; error: boolean } | null>(null);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
  }, []);
  const perform = useCallback(
    async (task: () => Promise<unknown>, message = '已保存到本机') => {
      try {
        await trackOperation(task);
        notify(message);
        return true;
      } catch (e) {
        notify(e instanceof Error ? e.message : '保存失败，请重试。', true);
        return false;
      }
    },
    [notify],
  );
  return (
    <Context.Provider value={{ notify, perform }}>
      {children}
      {toast && (
        <div role="status" className={`toast ${toast.error ? 'error' : ''}`}>
          <span>{toast.text}</span>
          <button aria-label="关闭提示" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useFeedback() {
  return useContext(Context);
}
