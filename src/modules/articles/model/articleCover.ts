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

/** `/uploads/admin/<name>`: the names server/adminImageUploadRoutes.ts generates. */
const ADMIN_UPLOAD_COVER = /^\/uploads\/admin\/([a-z0-9-]+\.webp)$/;

export type ResponsiveCover = { src: string; srcSet?: string; avifSrcSet?: string };

/**
 * A proxied cover or an admin upload as WebP and AVIF variants for `srcSet`;
 * `src` is the widest WebP for browsers that ignore `srcSet`. Admin uploads
 * are stored up to 1800 px wide, about three times a card. Other sources are
 * returned unchanged.
 */
export function responsiveArticleCover(value?: string): ResponsiveCover {
  const src = articleImageSrc(value);
  const upload = src.match(ADMIN_UPLOAD_COVER)?.[1];
  const base = upload ? `/api/article-cover?upload=${upload}` : src;
  // A comma or space would split a srcset candidate.
  if (!base.startsWith('/api/article-cover?') || /[\s,]/.test(base)) return { src };
  const variant = (width: number, format = '') => `${base}&w=${width}${format}`;
  const srcSet = (format: string) => ARTICLE_COVER_WIDTHS.map(width => `${variant(width, format)} ${width}w`).join(', ');
  return {
    src: variant(ARTICLE_COVER_WIDTHS[ARTICLE_COVER_WIDTHS.length - 1]),
    srcSet: srcSet(''),
    avifSrcSet: srcSet('&format=avif'),
  };
}
