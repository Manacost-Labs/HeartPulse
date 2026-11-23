/**
 * Hosts and paths of card pictures the external catalogs return that the
 * site's image proxy (`/api/public-resource/`, `shared/publicResourceUrl.ts`)
 * serves. A test keeps every entry inside that proxy's allowlist.
 */
export const RENDER_URL_PREFIXES = [
  'https://art.hearthstonejson.com/v1/',
  'https://api.kolodahearthstone.com/uploads/',
  'https://bg.kolodahearthstone.ru/assset/',
  'https://bg.kolodahearthstone.ru/api/card-art',
  'https://d15f34w2p8l1cc.cloudfront.net/hearthstone/',
] as const;

/**
 * A card picture of an external catalog, kept only when the image proxy
 * serves it: an unknown host would make a guest's browser load an arbitrary
 * image. Anything else is `null`, and the page shows the HearthstoneJSON
 * render of the card id.
 */
export function proxiedRenderUrl(value: unknown): string | null {
  const raw = typeof value === 'string' ? value.trim() : '';
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.username || url.password || url.port) return null;
  const href = url.href;
  return RENDER_URL_PREFIXES.some(prefix => href.startsWith(prefix)) ? href : null;
}
