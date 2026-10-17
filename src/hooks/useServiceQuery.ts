import { useLiveQuery } from 'dexie-react-hooks';

/** Dexie observes reads made through a Service → Repository call. */
export function useServiceQuery<T>(read: () => Promise<T[]>, service: object): T[] {
  return useLiveQuery(read, [service], []);
}

export function useServiceValue<T>(
  read: () => T | Promise<T>,
  dependencies: unknown[],
): T | undefined {
  return useLiveQuery(read, dependencies);
}
