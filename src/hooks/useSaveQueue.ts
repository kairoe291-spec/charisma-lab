import { useCallback, useEffect, useRef, useState } from 'react';
import { createSaveGroup, enqueueSave, hasUnsavedChanges } from '../services/saveCoordinator';
export function useSaveQueue() {
  const group = useRef(createSaveGroup());
  const [state, setState] = useState('已保存到本机');
  useEffect(() => {
    const current = group.current;
    current.listeners.add(setState);
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    addEventListener('beforeunload', warn);
    return () => {
      current.listeners.delete(setState);
      removeEventListener('beforeunload', warn);
    };
  }, []);
  const enqueue = useCallback((task: () => Promise<unknown>) => {
    return enqueueSave(group.current, task);
  }, []);
  return { enqueue, state };
}
