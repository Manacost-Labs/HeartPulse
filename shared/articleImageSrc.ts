const ARTICLE_COVER_PROXY_HOST =
  /^(?:www\.)?(?:hs-manacost\.ru|manacost\.ru|kolodahearthstone\.(?:com|ru))$/i;

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
