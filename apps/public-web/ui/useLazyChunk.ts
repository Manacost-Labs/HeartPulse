'use client';

import { useCallback, useEffect, useState } from 'react';
import { classifyAppError } from '@/src/components/appErrorRecovery';
import { claimChunkReload } from '@/src/components/chunkReloadGuard';

/** Pauses before the second and third attempt to load a chunk that failed. */
const RETRY_DELAYS_MS = [1_500, 3_000];

function sessionStore(): Storage | null {
  try { return window.sessionStorage; } catch { return null; }
}

/**
 * Loads a lazy chunk for a viewer who is going to need it. A failure is never swallowed: it is retried twice
 * on its own (a network blip heals here); a chunk that still does not come and looks like a missing asset (the
 * tab outlived a deploy) reloads the page once (the same guard as the global error page); any other end is
 * `failed` with a `retry`, so the page can say so instead of waiting forever.
 */
export function useLazyChunk(enabled: boolean, load: () => Promise<unknown>) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let timer: number | null = null;
    const attempt = (number: number) => {
      load().then(() => { if (!cancelled) setStatus('ready'); }, (error: unknown) => {
        if (cancelled) return;
        const delay = RETRY_DELAYS_MS[number];
        if (delay !== undefined) {
          timer = window.setTimeout(() => attempt(number + 1), delay);
        } else if (classifyAppError(error) === 'chunk' && claimChunkReload(sessionStore(), Date.now())) {
          window.location.reload();
        } else setStatus('failed');
      });
    };
    // A chunk that has arrived stays arrived when access is re-checked: no flash back to the open view.
    setStatus(previous => (previous === 'ready' ? previous : 'loading'));
    attempt(0);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, load, round]);
  const retry = useCallback(() => setRound(value => value + 1), []);
  return { ready: status === 'ready', failed: status === 'failed', retry };
}
