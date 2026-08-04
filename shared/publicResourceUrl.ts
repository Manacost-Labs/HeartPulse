export type PublicResourceSource = {
  origin: string;
  allowedPathPrefixes: readonly string[];
};

export const PUBLIC_RESOURCE_SOURCES = {
  db: {
    origin: 'https://db.kolodahs.ru',
    allowedPathPrefixes: ['/uploads/'],
  },
  bg: {
    origin: 'https://bg.kolodahearthstone.ru',
    allowedPathPrefixes: ['/assset/'],
  },
  hsjson: {
    origin: 'https://art.hearthstonejson.com',
    allowedPathPrefixes: ['/v1/'],
  },
  'hsjson-api': {
    origin: 'https://api.hearthstonejson.com',
    allowedPathPrefixes: ['/v1/'],
  },
  wiki: {
    origin: 'https://hearthstone.wiki.gg',
    allowedPathPrefixes: ['/images/'],
  },
  hsreplay: {
    origin: 'https://static.hsreplay.net',
    allowedPathPrefixes: ['/static/'],
  },
  deckview: {
    origin: 'https://api.blizzcore.ru',
    allowedPathPrefixes: ['/static/generated/'],
  },
} as const satisfies Record<string, PublicResourceSource>;

const PUBLIC_RESOURCE_SOURCE_BY_HOST = new Map(
  Object.entries(PUBLIC_RESOURCE_SOURCES).map(([key, source]) => [
    new URL(source.origin).hostname,
    { key, ...source },
  ]),
);

export function publicResourceUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/api/public-resource/')) return raw;

  try {
    const url = new URL(raw);
    const source = PUBLIC_RESOURCE_SOURCE_BY_HOST.get(url.hostname.toLowerCase());
    if (
      url.protocol !== 'https:'
      || !source
      || !source.allowedPathPrefixes.some(prefix => url.pathname.startsWith(prefix))
    ) {
      return raw;
    }
    return `/api/public-resource/${source.key}${url.pathname}${url.search}`;
  } catch {
    return raw;
  }
}

/**
 * Produces a browser-safe absolute URL for SSR metadata and markup.
 * Known third-party resources are routed through Arena. Unknown remote hosts
 * are rejected so server-rendered pages cannot bypass the delivery boundary.
 */
export function sameOriginPublicResourceUrl(
  value: unknown,
  origin: string,
  fallback: string | null = null,
): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const proxied = publicResourceUrl(raw);

  try {
    const parsed = new URL(proxied, `${origin}/`);
    if (parsed.origin !== new URL(origin).origin) return fallback;
    return parsed.href;
  } catch {
    return fallback;
  }
}
