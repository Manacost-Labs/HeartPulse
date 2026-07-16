import type { StandardMetaPreview } from './standardMetaRoutes.js';

type FetchLike = typeof fetch;

export type DeckviewPreviewOptions = {
  apiBaseUrl: string;
  publicBaseUrl: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveDeckviewImageUrl(payload: any, publicBaseUrl: string): string | null {
  const publicBase = trimTrailingSlash(publicBaseUrl);
  const imagePath = typeof payload?.image_path === 'string' ? payload.image_path.trim() : '';
  if (/^\/static\/generated\/[A-Za-z0-9._-]+$/.test(imagePath)) {
    return `${publicBase}${imagePath}`;
  }

  const filename = typeof payload?.filename === 'string' ? payload.filename.trim() : '';
  if (/^[A-Za-z0-9._-]+$/.test(filename)) {
    return `${publicBase}/static/generated/${encodeURIComponent(filename)}`;
  }

  const imageUrl = typeof payload?.image_url === 'string' ? payload.image_url.trim() : '';
  if (imageUrl.startsWith(`${publicBase}/static/generated/`)) return imageUrl;
  return null;
}

export async function renderDeckviewPreview(
  recommendation: { deckCode: string; deckName: string; hash: string },
  options: DeckviewPreviewOptions,
): Promise<StandardMetaPreview> {
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ManacostArena/1.0',
      },
      body: JSON.stringify({
        deck_code: recommendation.deckCode,
        deck_name: recommendation.deckName,
      }),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('DECKVIEW_TIMEOUT');
    throw new Error('DECKVIEW_RENDER_FAILED');
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    throw new Error('DECKVIEW_RENDER_FAILED');
  }
  if (!response.ok || payload?.success !== true) throw new Error('DECKVIEW_RENDER_FAILED');

  const imageUrl = resolveDeckviewImageUrl(payload, options.publicBaseUrl);
  if (!imageUrl) throw new Error('DECKVIEW_RENDER_FAILED');
  return {
    hash: recommendation.hash,
    state: 'done',
    ready: true,
    imageUrl,
    error: null,
  };
}
