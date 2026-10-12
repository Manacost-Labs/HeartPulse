import { useEffect, useId, useState } from 'react';
import type { createBattlegroundLibraryResource } from './model/libraryResource';

/** Keeps previous filters' data out of a new selection while sharing viewer-scoped reads. */
export function useBattlegroundLibraryData<T>(
  resource: ReturnType<typeof createBattlegroundLibraryResource<T>>,
  kind: string, pool: string, viewerScope?: string,
) {
  const localScope = useId();
  const scope = viewerScope ?? localScope;
  const key = `${scope}:${kind}:${pool}`;
  const [state, setState] = useState(() => ({ key, data: resource.peek(scope, kind, pool), error: '' }));
  useEffect(() => {
    let active = true;
    void resource.load(scope, kind, pool).then(data => {
      if (active) setState({ key, data, error: '' });
    }, error => {
      if (active) setState({ key, data: null, error: error instanceof Error ? error.message : 'Не удалось загрузить библиотеку' });
    });
    return () => { active = false; };
  }, [resource, kind, pool, scope, key]);
  const current = state.key === key ? state : { key, data: resource.peek(scope, kind, pool), error: '' };
  return { data: current.data, error: current.error, loading: !current.data && !current.error };
}
