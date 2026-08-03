type DeckRenderPayload = {
  ok?: boolean;
  ready?: boolean;
  imageUrl?: string;
  error?: string;
};

const MAX_MEMORY_ENTRIES = 256;
const completedRenders = new Map<string, string>();
const pendingRenders = new Map<string, Promise<string>>();

export function deckRenderCacheKey(deckCode: string, deckName: string): string {
  return `${deckCode.replace(/\s+/g, '')}\u0000${deckName.trim()}`;
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

  const request = fetchImpl('/api/deck/render', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckCode, deckName }),
  }).then(async response => {
    const payload = await response.json().catch(() => ({})) as DeckRenderPayload;
    if (!response.ok || payload.ok !== true || payload.ready !== true || !payload.imageUrl) {
      throw new Error(payload.error || 'Не удалось собрать изображение колоды');
    }
    rememberRender(key, payload.imageUrl);
    return payload.imageUrl;
  }).finally(() => {
    pendingRenders.delete(key);
  });
  pendingRenders.set(key, request);
  return request;
}
