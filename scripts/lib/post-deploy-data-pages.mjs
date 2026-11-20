/**
 * Indexable pages whose server HTML carries data read from Express, and the
 * `marker` that only the HTML with that data has: a CSS class of the data
 * block, which does not depend on how much data there is (a word count does).
 * The copy without the data is what the build makes without Express, or what
 * a first-paint read that missed its 600 ms budget ships. `copyWords` and
 * `dataWords` are only what a stand measured on 2026-11-16 (2026-11-19 for /legendaries/ and /heroes/; the copy against
 * the page with live data) and show the size of the difference.
 * The warm-up after a deploy (`scripts/warm-prerendered-pages.mjs`) waits for
 * the marker, and a production monitor can use the same table.
 *
 * `isr` pages are prerendered at build time (the build has no Express), so
 * their copy is replaced through `/health/next/revalidate/`
 * (`DATA_PAGES` in apps/public-web/app/health/next/revalidate/route.ts must
 * list exactly these). Dynamic pages have no build copy; they ship without the
 * data when their first-paint read misses its budget (a cold or busy server).
 * The library hub and listings (`/library/`, `/library/<kind>/`) carry the open list; `copyWords`/`dataWords` are 0 (not measured).
 * The hub's marker is the class of a list size (only a filled copy has one), a listing's a card tile (the copy has a notice).
 */
export const DATA_PAGES = [
  { path: '/standard/meta/', isr: true, marker: 'standard-meta__results', copyWords: 213, dataWords: 345 },
  { path: '/standard/meta/wild/', isr: true, marker: 'standard-meta__results', copyWords: 213, dataWords: 345 }, // words: the Standard page's, not a stand measurement
  { path: '/articles/', isr: true, marker: 'article-card-modern', copyWords: 144, dataWords: 895 },
  { path: '/tierlist/', isr: true, marker: 'hs-tier-card', copyWords: 557, dataWords: 831 },
  { path: '/classes/', isr: true, marker: 'arena-class-meter-label', copyWords: 469, dataWords: 554 },
  { path: '/legendaries/', isr: true, marker: 'legendary-group-card', copyWords: 346, dataWords: 4931 },
  { path: '/heroes/', isr: true, marker: 'battleground-hero-card', copyWords: 172, dataWords: 2250 },
  { path: '/standard/matchups/', isr: true, marker: 'ui-matchup-matrix__grid', copyWords: 120, dataWords: 1500 }, // words: an estimate, not a stand measurement
  { path: '/battlegrounds/tier-list/', isr: true, marker: 'bg-tierlist-strategy__cards', copyWords: 95, dataWords: 1500 },
  { path: '/library/', isr: true, marker: 'bg-library-public__size', copyWords: 0, dataWords: 0 },
  { path: '/library/minions/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/spells/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/anomalies/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/dark-gifts/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/quests/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/rewards/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/darkmoon-prizes/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/trinkets/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  { path: '/library/timewarped/', isr: true, marker: 'bg-library-card-tile', copyWords: 0, dataWords: 0 },
  // Mode hubs (#557): the block «Сейчас в …» exists only with data; words not measured.
  { path: '/standard/', isr: true, marker: 'mode-hub__now', copyWords: 0, dataWords: 0 },
  { path: '/arena/', isr: true, marker: 'mode-hub__now', copyWords: 0, dataWords: 0 },
  { path: '/battlegrounds/', isr: true, marker: 'mode-hub__now', copyWords: 0, dataWords: 0 },
  { path: '/wild/', isr: true, marker: 'mode-hub__now', copyWords: 0, dataWords: 0 },
  { path: '/leaderboards/', marker: 'leaderboards-table__rank', copyWords: 197, dataWords: 811 },
  { path: '/cosmetics/', marker: 'cosmetics-hero-card', copyWords: 192, dataWords: 314 },
  { path: '/cosmetics/heroes/', marker: 'cosmetics-hero-card', copyWords: 193, dataWords: 315 },
  { path: '/cosmetics/coins/', marker: 'cosmetics-grid-coins', copyWords: 133, dataWords: 437 },
  { path: '/cosmetics/pets/', marker: 'cosmetics-pet-card', copyWords: 134, dataWords: 234 },
  { path: '/streamers/', marker: 'streamers-toolbar', copyWords: 144, dataWords: 786 },
  { path: '/standard/patches/', marker: 'hp-release__title', copyWords: 132, dataWords: 4102 },
  { path: '/standard/archetypes/', marker: 'archetype-row__rank', copyWords: 186, dataWords: 3603 },
  // The Wild list (#637): the same rows as the Standard list; words not measured.
  { path: '/standard/archetypes/wild/', marker: 'archetype-row__rank', copyWords: 0, dataWords: 0 },
  { path: '/standard/fun-decks/', marker: 'fun-deck-card__why', copyWords: 279, dataWords: 410 },
  // The tool page reads two Express answers in a 600 ms budget; `assemble-title` («Что выпало?») is only in the HTML that got both. Words: not measured.
  { path: '/standard/assemble/', marker: 'assemble-title', copyWords: 0, dataWords: 0 },
  { path: '/standard/assemble/?format=wild', marker: 'assemble-title', copyWords: 0, dataWords: 0 },
  { path: '/', marker: 'home-orbit-class__copy', copyWords: 363, dataWords: 433 },
];

/** A streamer profile (`/streamers/<slug>/`): the slug is taken from the list page. */
export const STREAMER_PROFILE_PAGE = { marker: 'streamers-profile__identity', copyWords: 127, dataWords: 766 };

/** Whether the HTML has an element whose `class` names the marker. */
export function hasMarker(html, marker) {
  for (let from = html.indexOf('class="'); from !== -1; from = html.indexOf('class="', from + 7)) {
    const value = html.slice(from + 7, html.indexOf('"', from + 7));
    if (value.split(' ').includes(marker)) return true;
  }
  return false;
}

/** The text of an HTML document: tags are walked over one by one, `script` and `style` elements are skipped whole. */
export function visibleText(html) {
  const lower = html.toLowerCase();
  const parts = [];
  let position = 0;
  while (position < html.length) {
    const open = html.indexOf('<', position);
    if (open === -1) { parts.push(html.slice(position)); break; }
    parts.push(html.slice(position, open), ' ');
    const tagEnd = html.indexOf('>', open);
    if (tagEnd === -1) break;
    position = tagEnd + 1;
    for (const raw of ['script', 'style']) {
      if (!lower.startsWith(`<${raw}`, open) || !/[\s>/]/.test(lower[open + raw.length + 1] ?? '>')) continue;
      const close = lower.indexOf(`</${raw}`, position);
      position = close === -1 ? html.length : (html.indexOf('>', close) + 1 || html.length);
    }
  }
  return parts.join('');
}

/** Visible words of an HTML document. */
export function countWords(html) {
  return visibleText(html).split(/\s+/).filter(Boolean).length;
}
