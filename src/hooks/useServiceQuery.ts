import { useLiveQuery } from 'dexie-react-hooks';

/** Dexie observes reads made through a Service → Repository call. */
export function useServiceQuery<T>(read: () => Promise<T[]>, service: object): T[] {
  return useLiveQuery(read, [service], []);
}

/** A pending read is distinct from a successful query returning no records. */
export function useServiceQueryState<T>(read: () => Promise<T[]>, service: object) {
  const result = useLiveQuery(read, [service]);
  return { data: result ?? [], loading: result === undefined };
}

export function useServiceValue<T>(
  read: () => T | Promise<T>,
  dependencies: unknown[],
): T | undefined {
  return useLiveQuery(read, dependencies);
}
