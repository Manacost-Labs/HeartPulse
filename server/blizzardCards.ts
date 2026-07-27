import { isIP } from 'node:net';

type FetchLike = typeof fetch;

type BlizzardCardImageClientOptions = {
  clientId?: string;
  clientSecret?: string;
  region?: string;
  fetchImpl?: FetchLike;
  now?: () => number;
  catalogTtlMs?: number;
};

type AccessToken = {
  value: string;
  expiresAt: number;
};

type BlizzardCardImageResolver = {
  configured: boolean;
  getImageUrl: (dbfId: number) => Promise<string | null>;
  getDirectImageUrl?: (dbfId: number) => Promise<string | null>;
};

const DEFAULT_CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CARD_IMAGE_BYTES = 8 * 1024 * 1024;
// Official contracts:
// https://develop.battle.net/documentation/guides/using-oauth
// https://develop.battle.net/documentation/hearthstone/game-data-apis

function normalizeRegion(region: string | undefined): string {
  const value = String(region ?? 'eu').trim().toLowerCase();
  return /^[a-z]{2}$/.test(value) ? value : 'eu';
}

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeBlizzardImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.local') || isIP(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function isBlizzardImageContentType(value: string | null | undefined): boolean {
  const contentType = String(value ?? '').split(';', 1)[0].trim().toLowerCase();
  return contentType.startsWith('image/') || contentType === 'application/octet-stream';
}

export async function downloadBlizzardCardImage(options: {
  dbfId: number;
  client: BlizzardCardImageResolver;
  fetchImpl?: FetchLike;
}): Promise<Buffer | null> {
  const dbfId = positiveInteger(options.dbfId);
  if (!dbfId || !options.client.configured) return null;

  const imageUrl = await (
    options.client.getDirectImageUrl?.(dbfId)
    ?? options.client.getImageUrl(dbfId)
  );
  if (!imageUrl) return null;

  const response = await (options.fetchImpl ?? fetch)(imageUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/*;q=0.8',
      'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Blizzard card image HTTP ${response.status}`);
  if (!isBlizzardImageContentType(response.headers.get('content-type'))) {
    throw new Error(`Blizzard card image content type is not an image: ${response.headers.get('content-type') || 'missing'}`);
  }
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CARD_IMAGE_BYTES) {
    throw new Error(`Blizzard card image exceeds ${MAX_CARD_IMAGE_BYTES} bytes`);
  }

  const image = Buffer.from(await response.arrayBuffer());
  if (image.length > MAX_CARD_IMAGE_BYTES) {
    throw new Error(`Blizzard card image exceeds ${MAX_CARD_IMAGE_BYTES} bytes`);
  }
  return image;
}

export function createBlizzardCardImageClient(options: BlizzardCardImageClientOptions = {}) {
  const clientId = String(options.clientId ?? '').trim();
  const clientSecret = String(options.clientSecret ?? '').trim();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const region = normalizeRegion(options.region);
  const apiOrigin = `https://${region}.api.blizzard.com`;
  const catalogTtlMs = Math.max(60_000, options.catalogTtlMs ?? DEFAULT_CATALOG_TTL_MS);
  const configured = Boolean(clientId && clientSecret);

  let accessToken: AccessToken | null = null;
  let tokenPromise: Promise<string> | null = null;
  let catalog: { imagesByDbfId: Map<number, string>; expiresAt: number } | null = null;
  let catalogPromise: Promise<Map<number, string>> | null = null;
  const directCardPromises = new Map<number, Promise<string | null>>();

  function clearToken() {
    accessToken = null;
  }

  async function getAccessToken(): Promise<string> {
    if (!configured) throw new Error('Blizzard credentials not configured');
    if (accessToken && accessToken.expiresAt > now() + 60_000) return accessToken.value;
    if (tokenPromise) return tokenPromise;

    tokenPromise = (async () => {
      const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const response = await fetchImpl('https://oauth.battle.net/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Blizzard OAuth HTTP ${response.status}`);

      const payload = await response.json() as { access_token?: unknown; expires_in?: unknown };
      const value = typeof payload.access_token === 'string' ? payload.access_token : '';
      if (!value) throw new Error('Blizzard OAuth response has no access token');
      const expiresInSeconds = positiveInteger(payload.expires_in) ?? 86_400;
      accessToken = {
        value,
        expiresAt: now() + expiresInSeconds * 1000,
      };
      return value;
    })().finally(() => {
      tokenPromise = null;
    });

    return tokenPromise;
  }

  async function fetchApiJson(path: string, retryAuth = true): Promise<{ response: Response; payload: any }> {
    const token = await getAccessToken();
    const response = await fetchImpl(`${apiOrigin}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 401 && retryAuth) {
      clearToken();
      return fetchApiJson(path, false);
    }
    const payload = response.ok ? await response.json() : null;
    return { response, payload };
  }

  async function loadCatalog(): Promise<Map<number, string>> {
    if (!configured) return new Map();
    if (catalog && catalog.expiresAt > now()) return catalog.imagesByDbfId;
    if (catalogPromise) return catalogPromise;

    catalogPromise = (async () => {
      const imagesByDbfId = new Map<number, string>();
      let page = 1;
      let pageCount = 1;

      while (page <= pageCount) {
        const query = new URLSearchParams({
          locale: 'ru_RU',
          pageSize: '500',
          page: String(page),
        });
        const { response, payload } = await fetchApiJson(`/hearthstone/cards?${query}`);
        if (!response.ok) throw new Error(`Blizzard cards HTTP ${response.status}`);

        pageCount = Math.min(50, Math.max(1, positiveInteger(payload?.pageCount) ?? 1));
        for (const card of Array.isArray(payload?.cards) ? payload.cards : []) {
          const dbfId = positiveInteger(card?.id)
            ?? positiveInteger(String(card?.slug ?? '').split('-', 1)[0]);
          const imageUrl = safeBlizzardImageUrl(card?.image);
          if (dbfId && imageUrl) imagesByDbfId.set(dbfId, imageUrl);
        }
        page += 1;
      }

      catalog = {
        imagesByDbfId,
        expiresAt: now() + catalogTtlMs,
      };
      return imagesByDbfId;
    })().finally(() => {
      catalogPromise = null;
    });

    return catalogPromise;
  }

  async function fetchDirectCard(dbfId: number): Promise<string | null> {
    const existing = directCardPromises.get(dbfId);
    if (existing) return existing;

    const request = (async () => {
      const query = new URLSearchParams({ locale: 'ru_RU' });
      const { response, payload } = await fetchApiJson(`/hearthstone/cards/${dbfId}?${query}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Blizzard card ${dbfId} HTTP ${response.status}`);
      const imageUrl = safeBlizzardImageUrl(payload?.image);
      if (imageUrl && catalog) catalog.imagesByDbfId.set(dbfId, imageUrl);
      return imageUrl;
    })().finally(() => {
      directCardPromises.delete(dbfId);
    });

    directCardPromises.set(dbfId, request);
    return request;
  }

  async function getImageUrl(dbfIdInput: number): Promise<string | null> {
    const dbfId = positiveInteger(dbfIdInput);
    if (!configured || !dbfId) return null;

    try {
      const imagesByDbfId = await loadCatalog();
      const catalogUrl = imagesByDbfId.get(dbfId);
      if (catalogUrl) return catalogUrl;
    } catch {
      // A direct card lookup can still succeed if the catalog endpoint is temporarily unavailable.
    }

    return fetchDirectCard(dbfId);
  }

  return {
    configured,
    getImageUrl,
    getDirectImageUrl: fetchDirectCard,
  };
}
