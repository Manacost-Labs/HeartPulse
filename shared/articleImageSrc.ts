const ARTICLE_COVER_PROXY_HOST =
  /^(?:www\.)?(?:hs-manacost\.ru|kolodahearthstone\.(?:com|ru))$/i;

const LEGACY_KOLODA_ARTICLE_HOST = /^(?:www\.)?kolodahearthstone\.ru$/i;

export function canonicalArticleUrl(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (!LEGACY_KOLODA_ARTICLE_HOST.test(url.hostname)) return raw;
    url.protocol = 'https:';
    url.hostname = 'kolodahearthstone.com';
    url.port = '';
    return url.href;
  } catch {
    return raw;
  }
}

export function articleImageSrc(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/')) return raw;

  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && ARTICLE_COVER_PROXY_HOST.test(url.hostname)) {
      return `/api/article-cover?url=${encodeURIComponent(url.href)}`;
    }
  } catch {
    return raw;
  }

  return raw;
}
