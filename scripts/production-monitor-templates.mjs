import { readFileSync } from 'node:fs';

// One monitored URL per indexable public page template. The list is derived
// from the route inventory, so a new static page is picked up automatically;
// a dynamic template needs one record in SAMPLE_SOURCES (or a reasoned entry
// in UNMONITORED_TEMPLATES). tests/production-monitor.test.mjs fails when an
// indexable template is in none of them.
//
// A sample is either a fixed `path`, or the first URL of an entity sitemap
// segment (`segment` is a key of ENTITY_SITEMAP_SEGMENTS in the monitor).
const inventory = JSON.parse(readFileSync(
  new URL('../src/shared/seo/publicRouteInventory.json', import.meta.url),
  'utf8',
));

export const INDEXABLE_TEMPLATES = inventory.routes.filter(route => route.indexPolicy === 'index');

export const SAMPLE_SOURCES = {
  'cosmetics-kind': [{ path: '/cosmetics/heroes/' }],
  'cosmetics-detail': [{ segment: 'cosmetics' }],
  'guides-archive-detail': [{ segment: 'guidesArchive' }],
  'standard-cards-format': [{ path: '/standard/cards/standard/' }, { path: '/standard/cards/wild/' }],
  'standard-card-detail': [{ segment: 'standard' }, { segment: 'wild' }],
  'bg-hero-detail': [{ segment: 'battlegroundHeroes' }],
  'bg-library-kind': [{ path: '/library/minions/' }],
  'bg-library-detail': [{ segment: 'battlegroundMinions' }],
  'constructed-archetype-detail': [{ segment: 'archetypes' }],
  'standard-decks-class': [{ segment: 'decks' }],
  // The class pages of the Arena tier list (#668) are in static.xml, one fixed sample of the template.
  'tierlist-class': [{ path: '/tierlist/mage/' }],
};

export const UNMONITORED_TEMPLATES = {
  'bg-library-archive-detail':
    '/library/archive/<kind>/<slug>/ exists only for retired cards (the first minion of the sitemap answers 404) and no sitemap lists them; see #371',
  'bg-library-additional-detail':
    'no public source of a stable URL (library listings render client-side, no segment); see #371',
};

function isStaticTemplate(route) {
  return !route.pattern.includes(':');
}

export function pageTemplateSamples(templates = INDEXABLE_TEMPLATES) {
  const samples = [];
  const uncovered = [];
  for (const route of templates) {
    if (isStaticTemplate(route)) {
      samples.push({ id: route.id, path: route.pattern === '/' ? '/' : `${route.pattern}/` });
    } else if (SAMPLE_SOURCES[route.id]) {
      for (const source of SAMPLE_SOURCES[route.id]) samples.push({ id: route.id, ...source });
    } else if (!UNMONITORED_TEMPLATES[route.id]) {
      uncovered.push(route.id);
    }
  }
  return { samples, uncovered };
}
