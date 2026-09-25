/** Public page families roll out independently; APIs stay on Express. */
export function publicWebOwner(pathname, enabled = false, method = 'GET', pagesEnabled = false, galleryEnabled = false) {
  if ((!enabled && !pagesEnabled && !galleryEnabled) || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && pathname === '/') return 'next';
  if (pagesEnabled && /^\/(?:faq|privacy|terms|developers\/api|articles|guides-archive|heroes|library|contests|classes|tierlist|legendaries|standard\/(?:matchups|meta|fun-decks|vicious-gold|archetypes))\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/standard\/(?:archetypes|meta)\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/guides-archive\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/heroes\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/library\/(?:minions|spells|anomalies|dark-gifts|quests|rewards|darkmoon-prizes|trinkets|timewarped|archive(?:\/(?:minions|spells|anomalies|quests|rewards|darkmoon-prizes|trinkets))?)\/?$/.test(pathname)) return 'next';
  if (galleryEnabled && /^\/gallery\/?$/.test(pathname)) return 'next';
  // Include invalid card descendants so the enabled owner provides the real 404.
  return enabled && /^\/standard\/cards(?:\/.*)?$/.test(pathname) ? 'next' : 'legacy';
}
