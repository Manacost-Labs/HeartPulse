import { NAVIGATION_ROUTES } from '@/src/app/routing/navigationDefinitions';

const pageFamilies = NAVIGATION_ROUTES
  .filter(route => route.group !== 'admin')
  .map(route => (route.path === '/' ? '/' : `${route.path}/*`));

const eligiblePages = [
  { href_matches: pageFamilies },
  { href_matches: ['/', '/*/'] },
  { not: { href_matches: '/*\\?(.+)' } },
];

/**
 * Detail pages that listings show by the dozen (the card grid, cosmetics,
 * Battlegrounds heroes and library, archetype lists, the guide archive).
 */
const entityDetailPages = [
  '/standard/cards/:format/:card/',
  '/standard/archetypes/:format/:archetype/',
  '/standard/meta/:format/:archetype/',
  '/cosmetics/:kind/:card/',
  '/heroes/:hero/',
  '/library/:kind/:card/',
  '/library/archive/:kind/:card/',
  '/guides-archive/:guide/',
];

/**
 * Pages navigate as full documents, so Chromium prerenders the page behind a
 * link and swaps it in on click. Only the public navigation sections and their
 * detail pages qualify, at the canonical trailing-slash URL and without a
 * query: the admin panel, profiles, `/connect/`, `/r/` referral links,
 * `/?login` and `/api/` never load ahead of the visit. A prerendered page runs
 * its scripts early, so anything that records a visit must wait for
 * `prerenderingchange` (see `analyticsLoader.ts`).
 *
 * Section pages prerender on hover (moderate). Entity detail pages prerender
 * only when pressed (conservative): every prerender makes the page's `/api`
 * calls, and a pointer sweeping a grid of them, or a phone scrolling one
 * (moderate rules follow the viewport there), would spend the per-visitor API
 * rate limit on pages nobody opens.
 */
export const SPECULATION_RULES = {
  prerender: [{
    where: { and: [...eligiblePages, { not: { href_matches: entityDetailPages } }] },
    eagerness: 'moderate',
  }, {
    where: { and: [...eligiblePages, { href_matches: entityDetailPages }] },
    eagerness: 'conservative',
  }],
};
