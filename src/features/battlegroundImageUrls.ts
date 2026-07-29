const LEGACY_BG_HOST = 'bg.kolodahearthstone.ru';

/**
 * Routes third-party Battlegrounds card art through the same-origin image
 * optimizer. Full-size source URLs remain untouched for the lightbox.
 */
export function optimizedBattlegroundThumbnailUrl(rawUrl: unknown, width = 220): string {
  const source = String(rawUrl || '').trim();
  if (!source) return '';

  let localPath = '';
  if (
    source.startsWith('/api/public-resource/')
    || source.startsWith('/api/remote-image')
    || source.startsWith('/api/card-art')
  ) {
    localPath = source;
  } else if (source.startsWith('https://')) {
    const parsed = new URL(source);
    localPath = parsed.hostname.toLowerCase() === LEGACY_BG_HOST
      ? `${parsed.pathname}${parsed.search}`
      : `/api/remote-image?src=${encodeURIComponent(source)}`;
  }
  if (!localPath) return source;

  return `${localPath}${localPath.includes('?') ? '&' : '?'}width=${Math.round(width)}&quality=76&format=webp`;
}
