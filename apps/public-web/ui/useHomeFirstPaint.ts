import { startTransition, useEffect, useState } from 'react';
import type { HomeArticle, HomeSummaryData } from '@/src/modules/home/public';
const readSummary = async (signal: AbortSignal) => (await import('./homeFeedRequests')).readHomeSummary(signal);
const readArticles = async (signal: AbortSignal) => (await import('./homeFeedRequests')).readHomeArticles(signal);

function useFeed<T>(initial: T | null, request: (signal: AbortSignal) => Promise<T>) {
  const [fallback, setFallback] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (initial !== null) return;
    const controller = new AbortController();
    const complete = (value: T | null) => {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      // A data update must not replace already streamed sections with Suspense fallbacks.
      startTransition(() => {
        if (value !== null) setFallback(value);
        setFailed(value === null);
      });
    };
    // Bound code loading as well as the HTTP body; a stalled lazy chunk must not leave a spinner forever.
    const timer = setTimeout(() => { complete(null); controller.abort(); }, 10_000);
    void request(controller.signal).then(complete).catch(() => complete(null));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [initial, request]);
  return { data: initial ?? fallback, loading: initial === null && fallback === null && !failed };
}

/** Reads only missing anonymous home feeds; leaving home cancels both fallbacks. */
export function useHomeFirstPaint(summary: HomeSummaryData | null, articles: HomeArticle[] | null) {
  return {
    summary: useFeed(summary, readSummary),
    articles: useFeed(articles, readArticles),
  };
}
