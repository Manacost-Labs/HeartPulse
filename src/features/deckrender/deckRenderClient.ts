type DeckRenderPayload = {
  ok?: boolean;
  ready?: boolean;
  imageUrl?: string;
  error?: string;
};

const MAX_MEMORY_ENTRIES = 256;
const MAX_RENDER_ATTEMPTS = 3;
const RETRYABLE_RENDER_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const completedRenders = new Map<string, string>();
const pendingRenders = new Map<string, Promise<string>>();

export function deckRenderCacheKey(deckCode: string, deckName: string): string {
  return `${deckCode.replace(/\s+/g, '')}\u0000${deckName.trim()}`;
}

export function deckRenderImageRetryUrl(imageUrl: string, attempt: number): string {
  if (!imageUrl || attempt <= 0) return imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return imageUrl;
    url.searchParams.set('deckview_retry', String(attempt));
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function rememberRender(key: string, imageUrl: string): void {
  completedRenders.delete(key);
  completedRenders.set(key, imageUrl);
  while (completedRenders.size > MAX_MEMORY_ENTRIES) {
    const oldest = completedRenders.keys().next().value;
    if (typeof oldest !== 'string') break;
    completedRenders.delete(oldest);
  }
}

export function cachedDeckRender(deckCode: string, deckName: string): string {
  return completedRenders.get(deckRenderCacheKey(deckCode, deckName)) || '';
}

export function invalidateDeckRender(deckCode: string, deckName: string): void {
  completedRenders.delete(deckRenderCacheKey(deckCode, deckName));
}

function renderRetryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('Retry-After')?.trim();
  if (retryAfter && /^\d+(?:\.\d+)?$/.test(retryAfter)) {
    return Math.min(2_000, Math.max(0, Number(retryAfter) * 1_000));
  }
  return 150 * (2 ** attempt);
}

async function waitForRenderRetry(response: Response | null, attempt: number): Promise<void> {
  const delayMs = renderRetryDelayMs(response, attempt);
  if (delayMs <= 0) return;
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

async function fetchDeckRender(
  deckCode: string,
  deckName: string,
  fetchImpl: typeof fetch,
): Promise<string> {
  let lastError: Error = new Error('Не удалось собрать изображение колоды');
  for (let attempt = 0; attempt < MAX_RENDER_ATTEMPTS; attempt += 1) {
    let response: Response | null = null;
    try {
      response = await fetchImpl('/api/deck/render', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ deckCode, deckName }),
      });
    } catch (cause) {
      lastError = cause instanceof Error ? cause : lastError;
      if (attempt + 1 >= MAX_RENDER_ATTEMPTS) throw lastError;
      await waitForRenderRetry(null, attempt);
      continue;
    }

    const payload = await response.json().catch(() => ({})) as DeckRenderPayload;
    if (response.ok && payload.ok === true && payload.ready === true && payload.imageUrl) {
      return payload.imageUrl;
    }

    lastError = new Error(payload.error || 'Не удалось собрать изображение колоды');
    if (!RETRYABLE_RENDER_STATUSES.has(response.status) || attempt + 1 >= MAX_RENDER_ATTEMPTS) {
      throw lastError;
    }
    await waitForRenderRetry(response, attempt);
  }
  throw lastError;
}

export async function requestDeckRender(
  deckCode: string,
  deckName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const key = deckRenderCacheKey(deckCode, deckName);
  const completed = completedRenders.get(key);
  if (completed) return completed;
  const pending = pendingRenders.get(key);
  if (pending) return pending;

  const request = fetchDeckRender(deckCode, deckName, fetchImpl).then(imageUrl => {
    rememberRender(key, imageUrl);
    return imageUrl;
  }).finally(() => {
    pendingRenders.delete(key);
  });
  pendingRenders.set(key, request);
  return request;
}
