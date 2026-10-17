import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { CloudController, type CloudState } from './controller';
import type { CloudConfig } from './config';

export interface CloudContextValue extends CloudState {
  configure: (config: CloudConfig) => Promise<void>;
  sendOtp: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
}
const Context = createContext<CloudContextValue | null>(null);

export function CloudProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new CloudController());
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => {
    void controller.initialize();
    return controller.dispose;
  }, [controller]);
  return (
    <Context.Provider
      value={{
        ...state,
        configure: controller.configure,
        sendOtp: controller.sendOtp,
        verifyOtp: controller.verifyOtp,
        signOut: controller.signOut,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useCloud(): CloudContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('CloudProvider 尚未初始化。');
  return value;
}
