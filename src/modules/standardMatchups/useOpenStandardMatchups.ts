'use client';

import { useEffect, useState } from 'react';
import { loadPublicStandardMatchups, type PublicStandardMatchups } from './model/publicProjection';
import type { StandardMatchupsFormat } from './model/types';

/**
 * The open general slice of `format`: the copy the server printed while it fits (the most played archetypes of
 * Standard), the rest of the slice and the other format from the anonymous route. The other format's numbers
 * never stand in for the chosen one: until its answer comes, `data` is `null`.
 */
export function useOpenStandardMatchups(initial: PublicStandardMatchups | null, format: StandardMatchupsFormat) {
  const [data, setData] = useState<PublicStandardMatchups | null>(initial);
  const [status, setStatus] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [attempt, setAttempt] = useState(0);
  const complete = data?.format === format && !data.truncated;
  useEffect(() => {
    if (complete) return undefined;
    const controller = new AbortController();
    setStatus('loading');
    void loadPublicStandardMatchups(format, { signal: controller.signal }).then(next => {
      if (controller.signal.aborted) return;
      if (next) setData(next);
      setStatus(next ? 'idle' : 'failed');
    });
    return () => controller.abort();
  }, [format, complete, attempt]);
  return {
    data: data?.format === format ? data : null,
    loading: status === 'loading' || (!complete && status === 'idle'),
    failed: status === 'failed',
    retry: () => setAttempt(value => value + 1),
  };
}
