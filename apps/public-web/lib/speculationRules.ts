import { NAVIGATION_ROUTES } from '@/src/app/routing/navigationDefinitions';

const pageFamilies = NAVIGATION_ROUTES
  .filter(route => route.group !== 'admin')
  .map(route => (route.path === '/' ? '/' : `${route.path}/*`));

/**
 * Pages navigate as full documents, so Chromium prerenders the page behind a
 * link the visitor hovers or presses and swaps it in on click. Only the public
 * navigation sections and their detail pages qualify, at the canonical
 * trailing-slash URL and without a query: the admin panel, profiles,
 * `/connect/`, `/r/` referral links, `/?login` and `/api/` never load ahead
 * of the visit. A prerendered page runs its scripts early, so anything that
 * records a visit must wait for `prerenderingchange` (see `analyticsLoader.ts`).
 */
export const SPECULATION_RULES = {
  prerender: [{
    where: {
      and: [
        { href_matches: pageFamilies },
        { href_matches: ['/', '/*/'] },
        { not: { href_matches: '/*\\?(.+)' } },
      ],
    },
    eagerness: 'moderate',
  }],
};
