/**
 * Indexable pages whose server HTML carries data read from Express, and the
 * fewest words that HTML has when the data is there. A copy without the data
 * is shorter (measured 2026-11-16 against a build made without Express, or a
 * first-paint read that missed its 600 ms budget): `copy` below. The warm-up
 * after a deploy (`scripts/warm-prerendered-pages.mjs`) waits for `minWords`,
 * and a production monitor can use the same table.
 *
 * `isr` pages are prerendered at build time (the build has no Express), so
 * their copy is replaced through `/health/next/revalidate/`
 * (`DATA_PAGES` in apps/public-web/app/health/next/revalidate/route.ts must
 * list exactly these). Dynamic pages have no build copy; they ship without the
 * data when their first-paint read misses its budget (a cold or busy server).
 */
export const DATA_PAGES = [
  { path: '/standard/meta/', isr: true, minWords: 280, copy: 213, data: 345 },
  { path: '/articles/', isr: true, minWords: 500, copy: 144, data: 895 },
  { path: '/tierlist/', isr: true, minWords: 700, copy: 557, data: 831 },
  { path: '/classes/', isr: true, minWords: 510, copy: 469, data: 554 },
  { path: '/leaderboards/', minWords: 500, copy: 197, data: 811 },
  { path: '/cosmetics/', minWords: 260, copy: 192, data: 314 },
  { path: '/cosmetics/coins/', minWords: 300, copy: 133, data: 437 },
  { path: '/streamers/', minWords: 500, copy: 144, data: 786 },
  { path: '/standard/patches/', minWords: 1000, copy: 132, data: 4102 },
  { path: '/standard/archetypes/', minWords: 1000, copy: 186, data: 3603 },
  { path: '/standard/fun-decks/', minWords: 340, copy: 279, data: 410 },
  { path: '/', minWords: 400, copy: 363, data: 433 },
];

/** A streamer profile (`/streamers/<slug>/`): the slug is taken from the list page. */
export const STREAMER_PROFILE_PAGE = { minWords: 400, copy: 127, data: 766 };

/** Visible words of an HTML document: scripts, styles and tags do not count. */
export function countWords(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ')
    .split(/\s+/).filter(Boolean).length;
}
