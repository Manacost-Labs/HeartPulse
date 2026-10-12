import { fetchWithDeadline } from '@/src/shared/http/fetchWithDeadline';
import { articlesData } from '@/apps/public-web/lib/articlesData';
import { homeSummaryData } from '@/apps/public-web/lib/homeSummaryData';

async function readJson(path: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const response = await fetchWithDeadline(path, { signal, deadlineMs: 10_000,
    credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!response.ok) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error('Home feed unavailable');
  }
  return response.json();
}

/** Missing public home data only; the caller owns cancellation and failure presentation. */
export async function readHomeSummary(signal: AbortSignal) {
  return homeSummaryData(await readJson('/api/home/summary', signal));
}

export async function readHomeArticles(signal: AbortSignal) {
  return articlesData(await readJson('/api/articles', signal)).articles;
}
