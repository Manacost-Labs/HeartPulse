const ARTICLE_COVER_PROXY_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'kolodahearthstone.com',
  'www.kolodahearthstone.com',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);

/**
 * Widths `/api/article-cover?w=` serves (server/articleCoverRoutes.ts rejects
 * any other). The home teasers keep the same list; the markup test keeps them
 * equal.
 */
export const ARTICLE_COVER_WIDTHS = [480, 720, 960] as const;

/**
 * Rendered card width in `.articles-grid-modern`: one column below 640 px,
 * two below 1024 px, then three beside the sidebar up to a 446 px cap.
 */
export const ARTICLE_CARD_COVER_SIZES =
  '(min-width: 1740px) 446px, (min-width: 1024px) calc(33.4vw - 132px), (min-width: 640px) calc(50vw - 42px), calc(100vw - 44px)';

/** The API already proxies editorial covers; this keeps older absolute URLs on the same origin. */
export function articleImageSrc(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    if (ARTICLE_COVER_PROXY_HOSTS.has(url.hostname.toLowerCase())) {
      return `/api/article-cover?url=${encodeURIComponent(url.href)}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

/**
 * A proxied cover as WebP variants for `srcSet`; `src` is the widest variant
 * for browsers that ignore `srcSet`. Other sources are returned unchanged.
 */
export function responsiveArticleCover(value?: string): { src: string; srcSet?: string } {
  const src = articleImageSrc(value);
  // A comma or space would split a srcset candidate.
  if (!src.startsWith('/api/article-cover?') || /[\s,]/.test(src)) return { src };
  const variant = (width: number) => `${src}&w=${width}`;
  return {
    src: variant(ARTICLE_COVER_WIDTHS[ARTICLE_COVER_WIDTHS.length - 1]),
    srcSet: ARTICLE_COVER_WIDTHS.map(width => `${variant(width)} ${width}w`).join(', '),
  };
}
