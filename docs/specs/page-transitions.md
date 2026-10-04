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
  sections and their pages (except the entity detail pages below) are
  prerendered when a visitor hovers a link for 200 milliseconds or presses
  it, and the click opens the prepared document. The admin panel, profiles,
  `/connect/`, `/r/` referral links, `/api/` and any URL with a query
  (including `/?login`) load only when opened.
- Entity detail pages that listings show by the dozen (card, cosmetic, hero,
  Battlegrounds library card, archetype and guide pages) are never
  prerendered. A prerender runs the page's `/api` calls, so a pointer
  sweeping the card grid, or a finger scrolling it on a phone, would spend the
  per-visitor API rate limit on pages nobody opens, and a page activated
  after a refused call would show its error state. They fetch only their
  HTML, when the link is pressed (conservative prefetch).
- Links of the desktop sidebar also fetch their page's HTML after a 10
  millisecond hover. That prefetch runs no script and makes no `/api/` call;
  a click that comes before the 200 millisecond hover is prerendered from the
  fetched response, so the page opens about 100 milliseconds sooner (lab,
  with 200 milliseconds of server time: about 120 to 20 milliseconds from
  release to swap). Only the sidebar qualifies: content grids would fetch
  every link the pointer crosses, and on phones eager rules fire for every
  link in view, so the mobile drawer stays out.
- A prerendered page runs before the visit. It is counted as a pageview, and
  may record anything else about the visit, only after the visitor opens it.
- Page content fades through. The outgoing snapshot clears in 90 milliseconds
  (`--motion-instant`); then the destination fades in and rises by
  `--motion-rise` over 140 milliseconds (`--motion-fast`), so the two layouts
  never overlap and the page has settled 230 milliseconds after it is
  revealed. A click during the transition is lost, so the transition is kept
  short.
- The new content box stays where it is: it does not travel from the
  position or size it had in the outgoing, usually scrolled, page, so nothing
  moves across the sticky header. The outgoing snapshot is shifted back to
  where the reader saw it (the old page stores its content box position on
  `pageswap`, the new page applies the difference as `--vt-old-shift` on
  `pagereveal`) and clipped at the top of the new content box, so a page left
  from below the fold fades out in place instead of flashing its top or a
  blank area.
- On phones the navigation drawer closes, and releases its scroll lock, as
  soon as one of its links is followed, so Back returns to the reading
  position. A page restored from the back/forward cache never comes back with
  the drawer open. The drawer is a native popover in the server HTML, so its
  toggle and links work before the page has hydrated.
- `prefers-reduced-motion: reduce` disables the transition and keeps
  navigation immediate.
- Browsers without cross-document view transitions (Firefox, Safari before
  18.2) or without speculation rules navigate as plain document loads.

## Verification

Run `npm run build:next`,
`node --test tests/next-page-transitions-browser.test.mjs` and
`node --test tests/next-mobile-menu-browser.test.mjs`, then the normal
release checks. The transitions test covers the canonical links, the URLs
eligible for prefetching and prerendering, the sidebar prefetch, a
prerendered and a plain navigation, the animated pseudo elements with their
fade-through timing, the shifted snapshot of a scrolled page and reduced
motion. The drawer test covers the drawer without JavaScript, its entrance
and exit, closing from outside and from the back/forward cache, and Back
after a drawer link. Review forward and back navigation in a real
browser at mobile and desktop widths: the shell stays stable, content is not
clipped, and the console and network remain clean. Browser automation that
attaches its own DevTools session disables prerendering; observe that path
through the test instead.

## Documentation impact

This specification, `apps/public-web/README.md`, `design.md` ("Motion And
Protected Interactions") and `CHANGELOG.md` describe the behavior.
Architecture documentation is unchanged because navigation ownership and
module boundaries do not change.
