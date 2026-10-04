import { useEffect, useEffectEvent, useRef, useState } from 'react';

type SeededRequestState<T> = { key: string; data: T | null; error: string };

/**
 * Data of the request `key` for a view the server may already have rendered.
 *
 * - The seed answers its own request (`seedKey`), so that request is not made
 *   again after hydration. Any other key ends the seed for good.
 * - A seed without a key (a subscriber's page starting from the guest teaser)
 *   only stays on screen until the first response replaces it.
 * - Data of an earlier request stays while the next one loads (and after it
 *   fails), so a refresh can dim the view instead of turning it back into a
 *   loader.
 *
 * `load` may change on every render; only `key` and `ready` start a request,
 * so `key` must encode every input of `load`.
 */
export function useSeededRequest<T>(key: string, { seed, seedKey, ready, load, fallbackError }: {
  seed: T | null;
  seedKey: string;
  /** False while the request cannot be decided yet (the account check). */
  ready: boolean;
  load: (signal: AbortSignal) => Promise<T>;
  fallbackError: string;
}): { data: T | null; loading: boolean; error: string } {
  const [state, setState] = useState<SeededRequestState<T>>({ key: seedKey, data: seed, error: '' });
  const answered = useRef(seedKey);
  const start = useEffectEvent((signal: AbortSignal) => load(signal));

  useEffect(() => {
    if (key === answered.current) return undefined;
    if (!ready) return undefined;
    answered.current = '';
    const controller = new AbortController();
    start(controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ key, data, error: '' }); })
      .catch(cause => {
        if (controller.signal.aborted) return;
        setState(current => ({ key, data: current.data, error: cause instanceof Error ? cause.message : fallbackError }));
      });
    return () => controller.abort();
  }, [key, ready, fallbackError]);

  return { data: state.data, loading: state.key !== key, error: state.key === key ? state.error : '' };
}
