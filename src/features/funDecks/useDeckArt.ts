import { useCallback, useEffect, useRef, useState, type ReactEventHandler } from 'react';

/** How long a failed image waits before its one retry. */
export const DECK_ART_RETRY_MS = 4_000;

type ArtStatus = 'loading' | 'loaded' | 'waiting' | 'failed';

/**
 * State of a card image whose fallback is always drawn underneath: `loading`
 * (the image is on its way), `loaded`, `waiting` (failed once, retry pending)
 * and `failed` (gave up). The retry mounts a new <img> with the same URL: the
 * server answers a failed generation with 502 / no-store, so the browser asks
 * again. `attempt` is the React key that makes the element new.
 */
export function useDeckArt() {
  const [state, setState] = useState<{ status: ArtStatus; attempt: number }>({ status: 'loading', attempt: 0 });
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onLoad = useCallback<ReactEventHandler<HTMLImageElement>>(() => {
    setState(current => ({ ...current, status: 'loaded' }));
  }, []);
  const onError = useCallback<ReactEventHandler<HTMLImageElement>>(() => {
    setState(current => {
      if (current.attempt > 0) return { ...current, status: 'failed' };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState({ status: 'loading', attempt: 1 }), DECK_ART_RETRY_MS);
      return { ...current, status: 'waiting' };
    });
  }, []);
  /** An image served from the cache is complete before React attaches onLoad. */
  const ref = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth > 0) setState(current => (current.status === 'loaded' ? current : { ...current, status: 'loaded' }));
  }, []);

  return {
    status: state.status,
    attempt: state.attempt,
    showImage: state.status === 'loading' || state.status === 'loaded',
    imageProps: { ref, onLoad, onError },
  };
}
