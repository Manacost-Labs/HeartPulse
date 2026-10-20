import { useCallback, useEffect, useState } from 'react';

/**
 * One hero's detail payload: shared client cache, a cancelled lifetime and a
 * retry that repeats the request after a failure or a missed deadline.
 */
export function useBattlegroundHeroDetail<T>(dbfId: string, cache: Map<string, T>, load: (dbfId: string) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ payload: T | null; error: string }>(() => ({ payload: cache.get(dbfId) ?? null, error: '' }));
  useEffect(() => {
    const cached = cache.get(dbfId);
    if (cached) {
      setState({ payload: cached, error: '' });
      return undefined;
    }
    let alive = true;
    setState(current => current.payload || current.error ? { payload: null, error: '' } : current);
    load(dbfId).then(payload => {
      cache.set(dbfId, payload);
      if (alive) setState({ payload, error: '' });
    }, (error: unknown) => {
      if (alive) setState({ payload: null, error: error instanceof Error && error.message ? error.message : 'Не удалось загрузить героя' });
    });
    return () => { alive = false; };
  }, [attempt, cache, dbfId, load]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { payload: state.payload, loading: !state.payload && !state.error, error: state.error, retry };
}
