const PUBLIC_RESOURCE_SOURCES = new Map<string, {
  key: string;
  allowedPathPrefixes: readonly string[];
}>([
  ['db.kolodahs.ru', { key: 'db', allowedPathPrefixes: ['/uploads/'] }],
  ['bg.kolodahearthstone.ru', { key: 'bg', allowedPathPrefixes: ['/assset/'] }],
  ['art.hearthstonejson.com', { key: 'hsjson', allowedPathPrefixes: ['/v1/'] }],
  ['api.hearthstonejson.com', { key: 'hsjson-api', allowedPathPrefixes: ['/v1/'] }],
  ['hearthstone.wiki.gg', { key: 'wiki', allowedPathPrefixes: ['/images/'] }],
  ['static.hsreplay.net', { key: 'hsreplay', allowedPathPrefixes: ['/static/'] }],
]);

/**
 * Converts required third-party content to the Arena same-origin delivery
 * route. Unknown URLs and ordinary navigation links are intentionally left
 * untouched.
 */
export function publicResourceUrl(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/api/public-resource/')) return raw;

  try {
    const url = new URL(raw);
    const source = PUBLIC_RESOURCE_SOURCES.get(url.hostname.toLowerCase());
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

export function publicResourceImageUrl(
  value: unknown,
  options: { width: number; quality?: number },
): string {
  const source = publicResourceUrl(value);
  if (!source.startsWith('/api/public-resource/')) return source;
  const [pathname, search = ''] = source.split('?', 2);
  const params = new URLSearchParams(search);
  params.set('width', String(Math.round(options.width)));
  params.set('quality', String(Math.round(options.quality ?? 82)));
  params.set('format', 'webp');
  return `${pathname}?${params.toString()}`;
}
