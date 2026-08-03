import type { StandardMetaPreview } from './standardMetaRoutes.js';

type FetchLike = typeof fetch;

export type DeckviewPreviewOptions = {
  apiBaseUrl: string;
  publicBaseUrl: string;
  timeoutMs: number;
  apiKey?: string;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
};

export function deckviewPreviewConfigFromEnv() {
  return {
    apiBaseUrl: (process.env.DECKVIEW_RENDER_API_BASE_URL || 'http://127.0.0.1:5000/deckview-api/v1').replace(/\/+$/, ''),
    publicBaseUrl: (process.env.DECKVIEW_RENDER_PUBLIC_BASE_URL || 'https://api.blizzcore.ru').replace(/\/+$/, ''),
    apiKey: (process.env.DECKVIEW_RENDER_API_KEY || '').trim(),
    revision: (process.env.DECKVIEW_RENDER_REVISION || 'rust-v0.3.0-parchment-v1').trim(),
    timeoutMs: Math.max(5_000, Math.min(120_000, Number(process.env.DECKVIEW_RENDER_TIMEOUT_MS) || 105_000)),
    pollIntervalMs: Math.max(25, Math.min(1_000, Number(process.env.DECKVIEW_RENDER_POLL_INTERVAL_MS) || 100)),
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveDeckviewImageUrl(payload: any, publicBaseUrl: string): string | null {
  const publicBase = trimTrailingSlash(publicBaseUrl);

  const safeGeneratedPath = (value: unknown, fullPath = false): string | null => {
    const raw = typeof value === 'string' ? value.trim() : '';
    const relative = fullPath ? raw.replace(/^\/static\/generated\//, '') : raw;
    if (!relative || relative === raw && fullPath) return null;
    const parts = relative.split('/');
    if (!parts.every(part => /^[A-Za-z0-9._-]+$/.test(part) && part !== '.' && part !== '..')) return null;
    return parts.map(encodeURIComponent).join('/');
  };

  const imagePath = safeGeneratedPath(payload?.image_path, true);
  if (imagePath) {
    return `${publicBase}/static/generated/${imagePath}`;
  }

  const filename = safeGeneratedPath(payload?.filename);
  if (filename) {
    return `${publicBase}/static/generated/${filename}`;
  }

  const imageUrl = typeof payload?.image_url === 'string' ? payload.image_url.trim() : '';
  if (imageUrl.startsWith(`${publicBase}/static/generated/`)) {
    const relative = safeGeneratedPath(imageUrl.slice(publicBase.length), true);
    if (relative) return `${publicBase}/static/generated/${relative}`;
  }
  return null;
}

function renderHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Prefer: 'respond-async',
    'User-Agent': 'ManacostArena/1.0',
  };
  if (apiKey?.trim()) headers['X-API-Key'] = apiKey.trim();
  return headers;
}

function renderJobUrl(apiBaseUrl: string, payload: any): string | null {
  const jobId = typeof payload?.job_id === 'string' ? payload.job_id.trim() : '';
  if (!/^api-render-[a-f0-9]{64}$/.test(jobId)) return null;
  return `${apiBaseUrl}/render/jobs/${jobId}`;
}

async function waitForNextPoll(delayMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, delayMs));
}

export async function renderDeckviewPreview(
  recommendation: { deckCode: string; deckName: string; hash: string },
  options: DeckviewPreviewOptions,
): Promise<StandardMetaPreview> {
  const apiBaseUrl = trimTrailingSlash(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = Date.now() + options.timeoutMs;
  const pollIntervalMs = Math.max(25, Math.min(1_000, options.pollIntervalMs ?? 100));
  const headers = renderHeaders(options.apiKey);
  let response: Response;
  try {
    response = await fetchImpl(`${apiBaseUrl}/render/parchment`, {
      method: 'POST',
      headers,
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
  if (response.status === 202 && payload?.success === true) {
    const statusUrl = renderJobUrl(apiBaseUrl, payload);
    if (!statusUrl) throw new Error('DECKVIEW_RENDER_FAILED');
    let delayMs = pollIntervalMs;
    while (Date.now() < deadline) {
      await waitForNextPoll(delayMs);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      try {
        response = await fetchImpl(statusUrl, {
          headers,
          signal: AbortSignal.timeout(remainingMs),
        });
      } catch (error: any) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') throw new Error('DECKVIEW_TIMEOUT');
        throw new Error('DECKVIEW_RENDER_FAILED');
      }
      try {
        payload = await response.json();
      } catch {
        throw new Error('DECKVIEW_RENDER_FAILED');
      }
      if (response.ok && payload?.success === true && payload?.ready === true) break;
      if (response.status !== 202 || payload?.success !== true) throw new Error('DECKVIEW_RENDER_FAILED');
      delayMs = Math.min(1_000, Math.ceil(delayMs * 1.6));
    }
    if (payload?.ready !== true) throw new Error('DECKVIEW_TIMEOUT');
  } else if (!response.ok || payload?.success !== true) {
    throw new Error('DECKVIEW_RENDER_FAILED');
  }

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
