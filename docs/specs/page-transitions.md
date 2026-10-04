# Page transition motion

## Objective

Moving between pages should feel continuous without making HearthPulse slower
or obscuring the destination. Every page is a separate Next.js document, so
the browser carries the transition: the navigation, utility header and page
background change without animation while the page content cross-fades.

## Interaction contract

- Links and scripted navigation target the canonical trailing-slash URL, so a
  click is never answered with a redirect first.
- In browsers with speculation rules (Chromium), the public navigation
  sections and their detail pages are prerendered when a visitor hovers or
  presses a link, and the click opens the prepared document. The admin panel,
  profiles, `/connect/`, `/r/` referral links, `/api/` and any URL with a query
  (including `/?login`) load only when opened.
- A prerendered page runs before the visit. It is counted as a pageview, and
  may record anything else about the visit, only after the visitor opens it.
- Page content uses one short cross-fade. The outgoing snapshot clears in
  160 milliseconds while the destination settles over 300 milliseconds. The
  destination is partially visible from the first frame, so parchment does not
  flash through between pages.
- The two documents cross-fade where the new content sits. The content box
  does not travel from the position or size it had in the outgoing, usually
  scrolled, page, so nothing moves across the sticky header.
- `prefers-reduced-motion: reduce` disables the transition and keeps
  navigation immediate.
- Browsers without cross-document view transitions (Firefox, Safari before
  18.2) or without speculation rules navigate as plain document loads.

## Verification

Run `npm run build:next` and
`node --test tests/next-page-transitions-browser.test.mjs`, then the normal
release checks. The test covers the canonical links, the URLs eligible for
prerendering, a prerendered and a plain navigation, the animated pseudo
elements and reduced motion. `tests/next-canonical-links-browser.test.mjs`
checks that the content links of the main pages (home, arena, cards,
archetypes, meta, cosmetics, Battlegrounds, guides) carry the trailing slash
and that a hovered card link in the catalog is prerendered. Review forward
and back navigation in a real browser at mobile and desktop widths: the shell
stays stable, content is not clipped, and the console and network remain
clean. Browser automation that attaches its own DevTools session disables
prerendering; observe that path through the test instead.

## Documentation impact

This specification, `apps/public-web/README.md` and `CHANGELOG.md` describe the
behavior. Architecture documentation is unchanged because navigation ownership
and module boundaries do not change.
