import { useMemo } from 'react';
import { Repository } from '../data/repository';
import { db } from '../data/database';
import { useCloud } from '../cloud/context';

/** Capture identity in the instance: a delayed save can never switch its owner. */
export function useRepository() {
  const { scope } = useCloud();
  return useMemo(() => new Repository(db, scope), [scope]);
}
