/** Public page families roll out independently; APIs stay on Express. */
export function publicWebOwner(pathname, enabled = false, method = 'GET', pagesEnabled = false, galleryEnabled = false) {
  if ((!enabled && !pagesEnabled && !galleryEnabled) || !['GET', 'HEAD'].includes(method)) return 'legacy';
  if (pathname.startsWith('/_next/') || /^\/health\/next\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && pathname === '/') return 'next';
  if (pagesEnabled && /^\/admin(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/deck-builder(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/standard\/deck-builder(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/archetypes(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/connect(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/(?:id|profiles|u)(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/cosmetics(?:\/[^/]+){0,2}\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/battlegrounds\/tier-list(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/battlegrounds\/(?:strategies|tier-builder)(?:\/.*)?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/(?:faq|privacy|terms|developers\/api|articles|guides-archive|heroes|library|contests|streamers|leaderboards|classes|tierlist|legendaries|standard\/(?:matchups|meta|fun-decks|vicious-gold|archetypes|patches|radar))\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/standard\/(?:archetypes|meta)\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/guides-archive\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/streamers\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/heroes\/.+/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/library\/(?:minions|spells|anomalies|dark-gifts|quests|rewards|darkmoon-prizes|trinkets|timewarped|archive(?:\/(?:minions|spells|anomalies|quests|rewards|darkmoon-prizes|trinkets))?)\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/library\/(?:archive\/)?[^/]+\/[^/]+-[1-9][0-9]*\/?$/.test(pathname)) return 'next';
  // Shared replays, their previews and embeds, the download landing (the same patterns as Nginx).
  if (pagesEnabled && /^\/replay\/[0-9A-Za-z]{10}\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/og\/(?:replay\/[0-9A-Za-z]{10}|year\/[1-9][0-9]{0,9}\/20[0-9]{2})\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/embed\/(?:replay\/[0-9A-Za-z]{10}|deck\/[A-Za-z0-9+/=%]{8,420}|oembed)\/?$/.test(pathname)) return 'next';
  if (pagesEnabled && /^\/download\/?$/.test(pathname)) return 'next';
  if (galleryEnabled && /^\/gallery\/?$/.test(pathname)) return 'next';
  // Include invalid card descendants so the enabled owner provides the real 404.
  return enabled && /^\/standard\/cards(?:\/.*)?$/.test(pathname) ? 'next' : 'legacy';
}
