# Public client navigation

## Goal and acceptance

Public page links use the Next.js App Router after hydration. The navigation
mounted by the root layout keeps its DOM, expanded groups and sidebar scroll
position between public pages. The mobile drawer closes on navigation without
losing the page's scroll position. Content remains visible until the destination
is ready; the destination's content then fades in once, never a skeleton, without
moving its geometry.

The skip link remains the first DOM element in the public root, before the
pending navigation indicator, so keyboard entry and shell readiness share the
same accessibility contract.

The public sidebar omits its global update-status block, including the empty
«Нет данных» label. The profile control stays at the bottom; page data-loading
and freshness reporting are unchanged.

Switching navigation groups removes the old group's geometry immediately,
before revealing the new one. Closing a group must not postpone layout until
its fade finishes, move controls a second time, or leave hidden links visible.
Route intent is deduplicated only while Next's prefetch remains fresh. The
`onInvalidate` callback clears that marker; a new hover/focus can prepare the
route again, with no polling. A speculative failure must not interrupt the
interaction or prevent retry. Closed menus do not require a synchronous
React commit; an open mobile drawer still releases its lock before navigation.

Opening the mobile drawer from a scrolled page keeps the sticky top bar and
close button in the viewport. The fixed-body scroll lock publishes its saved
offset for the header's translation. The last nested lock restores the original
inline offset, including its priority, and the reading position on close.

Direct loads and links before hydration remain ordinary canonical HTML URLs.
Modified clicks, downloads, external links, API/identity endpoints, referrals
and admin navigation keep their native behaviour. Browser Back/Forward and
page-level error recovery remain available. Viewer access is shared inside
one document and rechecked quietly when the public route changes; a failed
verification hides paid access using the existing session policy.
The access provider keeps a stable, per-document snapshot store. Hydrated
readers receive verified changes before paint without invalidating unloaded
Suspense boundaries. Server-rendered home articles remain visible while their
lazy chunk loads, including when the guest profile check finishes first.

## Implementation plan

1. Test the client-navigation adapter and native-link exclusions in
   `tests/next-navigation.test.ts`. Keep the route ownership registry as the
   source for destinations owned by Next.
2. Mount the navigation controller in the root layout; retain the standalone
   page shell for Storybook and other isolated renders. Share the existing
   viewer access hook through the root provider. Register the App Router
   navigation adapter and prefetch public destinations on pointer/focus intent.
3. Keep the first document paint and server-rendered content free of entrance
   effects; use one short content transition after a client route commits,
   and the arrival below for sections that replace a placeholder.
4. Verify menu identity, scroll, groups, mobile closing, Back/Forward,
   modified clicks, viewer changes and route styles in real browser tests.

Application wiring lives in `apps/public-web/ui/`; reusable navigation and
its state controller live in `src/app/shell/`. Tests stay in `tests/` and are
registered once in `tests/test-suites.json`. Existing API payloads and server
authorization rules remain unchanged. No new dependency is needed.

## Checks and documentation

Run `npm run test:next-contracts`, `npm run test:registry`,
`npm run lint:next`, `npm run lint:architecture`, `npm run build:next`,
the focused navigation/mobile/access browser tests, `npm run budget:next`,
`npm run security:semgrep`, `npm run test:storybook` and
`npm run build-storybook`. Finish with a Chrome DevTools review at desktop
and phone widths, including console, network, accessibility and performance.

Documentation impact: this contract, `apps/public-web/README.md`,
`docs/architecture/module-boundaries.md`,
`docs/runbooks/public-navigation-stability.md` and `CHANGELOG.md`.
The reviewed JavaScript ceilings in `config/next-bundle-budgets.json` track
the shared navigation adapter; CSS ceilings are unchanged.

The approved diagnostic report is the acceptance baseline. After reviewing
the implementation, the owner authorized integration, commit, push and
production deployment on 2026-10-05. The normal main/CI deployment gates apply.

## Framework contract

### Intent and pending feedback (2026-10-12)

Improve public transitions without replacing the persistent menu or loading
domain code into the root layout. Keep native link exclusions and canonical URLs.
No dependency, API, access or telemetry change is required.

1. Guard speculative loading: pointer intent must last 120 ms (since
   2026-10-20 `--motion-fast`), leaving the link cancels it, keyboard focus
   prepares immediately, and touch (since 2026-10-20 a press), offline,
   Save-Data and 2G connections do not prefetch. Current-page links and
   fragment variants share no redundant request. Keep at most 32 fresh route markers;
   an old invalidation callback cannot clear a newer preparation.
2. Route both real anchors and legacy callbacks through one React transition.
   A reusable status surface appears after 200 ms of pending navigation and
   disappears on completion. It announces loading, preserves content geometry,
   allows a newer destination and respects reduced motion. Fast transitions
   show no flashing indicator. Timers and listeners stop on unmount.
3. Verify synthetic hover/cancel, freshness/eviction, slow route, rapid
   replacement, Back and native modified-click cases before integration.

Framework-independent prefetch lifecycle belongs in
`src/shared/navigation/routePrefetch.ts`; Next destination policy and DOM/router
adapters stay in `apps/public-web/ui/`. The status primitive belongs in
`src/shared/ui/NavigationProgress.tsx` with colocated Storybook states.
Use small named contracts and injected prefetch/clock/permission ports, with
existing indentation and explicit imports. Tests stay in the registered
navigation suites under `tests/`.

Run the checks listed above, including a production build and the focused
`tests/next-page-transitions-browser.test.mjs` regression; compare speculative
request counts and existing bundle budgets. Review desktop and phone transitions
in Chrome DevTools after automated checks. Record lab measurements separately
from field Web Vitals; this task does not claim a field-score improvement.

Next.js 16.4.2 and React 19.3.0 are the installed dependencies. App Router
navigation uses `router.push` and `router.prefetch` from
[`useRouter`](https://nextjs.org/docs/app/api-reference/functions/use-router).
Prefetch freshness uses the documented `onInvalidate` callback rather than
an application timer or a permanent visited-route list.
The root layout persists across client transitions as described in
[layouts](https://nextjs.org/docs/app/getting-started/layouts-and-pages).

Selected skills: resource-index, using-agent-skills, context-engineering,
debugging-and-error-recovery, spec-driven-development,
planning-and-task-breakdown, incremental-implementation,
test-driven-development, git-workflow-and-versioning, codegraph, context7,
frontend-design, TypeUI fundamentals, browser-testing-with-devtools,
react-best-practices, frontend-testing-debugging, api-and-interface-design,
source-driven-development, doubt-driven-development, security-and-hardening,
performance-optimization and web-quality performance/vitals/accessibility,
documentation-and-adrs. Before handoff: code-review-and-quality and
code-simplification.

### Soft content and complete intent preparation (2026-10-13)

The owner's goal is faster public navigation with simple, consistent motion.
Keep the current Next.js/React versions, public URLs, native link exclusions,
viewer verification and persistent navigation. Add no dependency or data cache.

Acceptance and implementation order:

1. Reproduce the dynamic-route prefetch gap with the existing navigation
   browser suite: a prepared `/guides-archive/` must commit without a new RSC
   request after click. The adapter explicitly requests full preparation using
   the installed router's `kind: 'full'` option, through its public method type.
   Preserve the hover dwell, focus preparation, network restrictions,
   freshness invalidation and capacity bound.
2. The persistent layout composes `RouteTransition` from `src/shared/ui`.
   A committed pathname change animates only the shell's `data-route-content`
   surface from opacity 0.8 to 1, using `--motion-base` (220 ms) and
   `--motion-ease`. No transform, exit delay, section staggering or document
   snapshot is needed. The first document paint and query/hash-only updates
   have no entrance effect. Reduced motion skips it; replacement/unmount
   cancels the previous animation. The wrapper uses `display: contents` and
   does not reserve layout space or remount the page tree.
3. Verify prepared and slow routes, rapid replacement, native links, Back,
   reduced motion and desktop/mobile geometry. Compare before/after timings
   in the same production fixture with an explicit 450 ms RSC delay; these
   are lab measurements, not field Web Vitals. Review initial bundles before
   changing a ceiling; adjust only the two routes whose previous margin is
   exhausted, using the existing 2% margin and 1 KiB rounding rule.

Use the checks above and `node --test tests/motion-tokens.test.mjs`; test the
new component's states in Storybook. Application adapters stay in
`apps/public-web/ui`, shared motion stays in `src/shared/ui`, and shell markup
stays in `src/app/shell`. No domain data loading moves into the layout.

Documentation impact: this spec, `apps/public-web/README.md`,
`docs/runbooks/public-navigation-stability.md`,
`config/next-bundle-budgets.json` and `CHANGELOG.md`.
Reviewed `docs/architecture/module-boundaries.md`: ownership and dependency
direction remain accurate. Integration and production belong to the coordinating
chat; no main push or deploy is part of this task.

Skills selected for this follow-up: resource-index, using-agent-skills,
context-engineering, codegraph, context7, spec-driven-development,
planning-and-task-breakdown, incremental-implementation, test-driven-development,
debugging-and-error-recovery, frontend-design, TypeUI fundamentals,
browser-testing-with-devtools, react-best-practices, frontend-testing-debugging,
performance-optimization, web-quality audit/performance/core-web-vitals/
accessibility, source-driven-development, doubt-driven-development,
documentation-and-adrs, git-workflow-and-versioning, ci-cd-and-automation and
react-doctor. Handoff includes
code-review-and-quality followed by code-simplification.

### Bounded home first paint and cancelled speculative reads (2026-10-13)

Continuation goal: remove confirmed waits and visual gaps before adding motion.
The home page currently holds its entire content for both independent public
feeds, each allowed ten seconds. Existing first-paint deadlines return `null`
without forwarding cancellation to Express, leaving abandoned requests alive.

Acceptance and order:

1. Reproduce a slow home feed delaying the complete document, and an expired
   first-paint read still starting a request, in the existing registered tests.
2. Give both home feeds the existing shared 600 ms document budget. Preserve
   independently completed data and distinguish a missing articles feed from
   a successfully empty one. On hydration, fetch only missing feeds; account
   pages issue no home reads. Cancel browser fallbacks on leaving the page.
3. Forward the first-paint abort signal through the anonymous Express adapter,
   including body reads, and cancel outstanding work at the deadline. Keep
   the ten-second maximum, omitted cookies and redirect rejection.
4. Retain rendered sections through nonurgent feed updates; keep the existing
   loading geometry and the simple committed-route motion. Verify partial
   failures, slow bodies, fast feeds, account navigation, rapid replacement,
   desktop/mobile rendering and initial bundles.

Source evidence: the installed React behavior and official
[Suspense guidance](https://react.dev/reference/react/Suspense), plus Node 22
[abort composition](https://nodejs.org/download/release/v22.17.0/docs/api/globals.html#static-method-abortsignalanysignals).
No dependency, global data cache, auth rule or parser boundary changes.
Documentation impact: this spec, `docs/runbooks/public-navigation-stability.md`,
`apps/public-web/README.md` and `CHANGELOG.md`. Shared-document conflicts stay
with the coordinator; do not edit another session's worktree or publish a release.
The selected skills remain those listed in the preceding continuation plan.

The home module exposes `data-home-feed="summary"` and
`data-home-feed="articles"` as DOM ports for the composed recovery effect.
The app uses those ports rather than the module's private CSS classes.
Only a pending feed settling triggers the shared 220 ms opacity effect;
prepared first paint and reduced motion remain immediate. Failure settlement
uses the same motion and retains the module's existing empty/status messages.

The browser loads `homeFeedRequests.ts` only when a feed is missing; prepared
home pages do not request this chunk. Its ten-second recovery deadline includes
code loading and response body parsing. Expiry settles the existing status and
cancels the request; a chunk arriving after expiry must not start a late fetch.
An unsuccessful response releases its unread body immediately, including a
server that sends error headers and then stops streaming.

### No blink (2026-10-23)

The owner reported the page blinking on navigation. A screencast of production
showed why: the old content left at the commit and the new one started at
`opacity: 0`, so for one or two frames the content area was empty parchment
(mean luminance about 225 against 100–150 for the pages) before it faded in.
The earlier whole-page settle from 0.8 had read as a flicker too.

`ENTRANCE_OPACITY_FLOOR` (`src/shared/ui/motionTokens.ts`) now lifts every
content-replacing entrance: a navigated page and a switched view
(`useViewEntrance`) keep full opacity and only move (rise, slide or zoom), and
a section replacing its skeleton settles from 0.6. Measured on the same
transitions, luminance now goes straight from the old page to the new one with
no overshoot. Panels and popovers that appear over content keep their fades.

### Entrance, immediate feedback and revisits (2026-10-18, revised 2026-10-20)

The owner found the committed-route settle (opacity 0.8 to 1) reading as a
flicker and the site slow and unstable, and chose a fade-through from four
previewed variants. The 2026-10-18 draft built it on a React `ViewTransition`
around the content box. Measured against `react-dom-client` of Next 16.3.8,
that boundary had costs no animation may have:

- every `<img>` inside a `ViewTransition` (all page content) becomes
  "suspensey": a transition commit, so every navigation and in-page filter,
  waits up to 800 ms for new eager images, and the view-transition update
  waits up to 500 ms more for visible ones;
- any transition commit waits for a running view transition to finish;
- the transition played on a page committed with skeletons, after which the
  real content replaced them without motion, and the home feed settled again.

The revised contract keeps the owner's rhythm without those costs:

1. `RouteTransition` (shared) gives the committed destination one entrance:
   the children of the shell's `data-route-content` box enter over
   `--motion-base` (220 ms) with `--motion-ease`, with the motion of the
   ValyroUI preset the navigation chose, at full opacity since 2026-10-23
   (see "No blink" below) (see "ValyroUI transitions" below; until 2026-10-21 a
   plain 140 ms fade). The outgoing content is
   replaced at the commit; there is no document snapshot, so nothing is
   captured, every click stays live and no commit waits for motion.
2. Only a link navigation started by the bridge (`expectRouteEntrance`) gets an
   entrance, and only when its pathname commits. Back/Forward, refreshes,
   query/hash-only pushes, a superseded destination, the first document paint
   and reduced motion change the page without motion.
3. A destination committed with skeletons (`.loading-block`,
   `[data-loading-surface]` of `LoadingSurface`) shows them at once, without
   an entrance. Each section arrives when it replaces its skeleton (the new
   outermost elements; more than eight new siblings arrive as their parent):
   opacity 0.6 to 1 and a rise by `--motion-rise` over `--motion-base`, the
   sections of one batch `--motion-stagger` apart (at most three steps), for
   at most 10 seconds and until no skeleton remains. The first document does
   the same from hydration on, for sections that replace a skeleton or the
   access check's `PaywallPending`; its server HTML stays still, and a link
   navigation ends those arrivals. Transform and opacity only: no layout shift
   is counted. While that runs,
   `routeEntranceActive()` is true and the home feed's own settle stands aside,
   so home content animates once after a navigation and keeps its settle after
   a first paint.
4. The persistent layout marks the chosen destination current at once with
   `useOptimistic`; the committed pathname replaces it.
5. `staleTimes.dynamic` is 30 seconds: public pages render anonymously (only
   `adminAccess.ts` reads cookies), so a page opened within that time is shown
   from the router cache. Back/Forward already reused it.
6. `NavigationProgress` appears after `--motion-base` of a pending navigation,
   grows from the start edge while the route loads, then fills
   (`--motion-instant`) and fades (`--motion-fast`). Script timers read the
   tokens through `src/shared/ui/motionTokens.ts`. Reduced motion shows it
   without motion.

Verification: `tests/next-page-transitions-browser.test.mjs` asserts one
220 ms content entrance (rise) at commit, no view-transition animation
anywhere, Back and reduced motion without motion and a menu click during the
entrance;
`RouteTransition.stories.tsx` covers the skeleton-then-content entrance.

### ValyroUI transitions (2026-10-21)

The owner asked for the ValyroUI page transitions (valyro.xyz/transitions,
free presets of `PageTransition`, vendored in `src/vendor/valyro-ui`) wherever
the reader switches something. The site adapter is
`src/components/transitions/`; all motion is opacity and transform at the
motion tokens (`--motion-base`, 220 ms; `--motion-stagger`), the GPU tier is
fixed (no WebGL probe on each page), and the first paint and server markup
never move. The preset engine (`transitionPresets.ts`, about 2.5 KB gzip) is
not in the initial JavaScript of pages without a `ViewSwitch`: the navigation
bridge loads it when the browser is idle (`lazyTransitionPresets.ts`), and
until then route entrances, list items and modal sheets fade.

1. Routes. The bridge picks the entrance from the step
   (`routeTransitionFor`) and passes its entering keyframes to
   `expectRouteEntrance`: the same page in the other mode
   (`/standard/cards/standard/` ↔ `/wild/`) slides along x towards the chosen
   mode (`shared-x`, Вольный is forward); a detail page (archetype, card,
   hero, Battlegrounds library entry, or any page nested under the current
   one) zooms in (`shared-z`), the way back to its list zooms out; any other
   route rises (`rise`, 16 px). Only the entering half plays, without the
   preset's hold, because the route has already replaced the old content:
   instant navigation, prefetch and the skeleton rules above are unchanged.
   While it plays the content box clips horizontally, so a sideways or zooming
   entrance never adds a scrollbar.
2. Views of one page (`ViewSwitch`, over `PageTransition`). Стандарт ↔ Вольный
   on meta and matchups (client state; the view changes when the new mode's
   data arrives, `data.format`), meta Карточки / Тиры / Таблица, matchups
   Полная матрица / Обзор, the meta map's Карта / Доли: `shared-x` towards the
   pressed button. The old view
   stays mounted, inert and hidden from assistive technology, until the new
   one has entered; both cross through opacity 0, so they never mix. A change
   during a change takes over from where the views are drawn.
3. Lighter switches (`useViewEntrance`): card library Галерея / Таблица, the
   Battlegrounds hero grid / table and the card page's history metric and
   comparison play the entering half of `fade-through` on their container;
   the old view goes at once.
4. Lists (`useListTransition`). A filter or page change of the card library
   grid (rarity, class, mana, set…) and of the archetype list (class, search):
   new items enter with the fade-through entrance row by row
   (`--motion-stagger`, at most two steps), items that stayed glide to their
   new place (FLIP) while at most 60 moved; items off screen do not animate.
   The archetype list's Стандарт ↔ Вольный is a list change too: the other
   mode's rows slide in with `shared-x` towards the chosen mode. The same hook
   moves the matchup overview's groups (strength filter, search, another
   archetype) and the meta share list (class filter, «Показать все»).
5. Modals. A `ModalSurface` panel docked to the bottom across the screen (the
   card preview bottom sheet on a phone) rises as the `sheet` preset; one
   docked to the right over the full height slides in as `cover`; centred
   dialogs keep their own entrance. There is no exit animation: callers
   unmount the surface. A content lightbox (`ModalSurface zoom`: the card
   page's media, the card preview sheet of patch notes and mulligan, deck
   renders, gallery and cosmetics art) is the exception: the pressed
   thumbnail, already decoded on the page, flies as a fixed copy from its
   place into the lightbox picture (`[data-lightbox-media]`) over
   `--motion-base` while the lightbox fades in under it, and back on every
   close (Esc, backdrop, `[data-modal-close]`, a swipe down on the picture on
   touch screens) before `onClose`. The picture opens with that thumbnail
   (`LightboxImage`) and swaps to the decoded full size in the same box; the
   card preview sheet keeps its one picture and error path (fallback render,
   retry), so it zooms when that picture is already loaded and fades
   otherwise.
   Triggers mark `data-lightbox-src` (and `data-lightbox-module` for a lazy
   lightbox chunk), preloaded on hover, focus and touch
   (`src/shared/ui/lightboxIntent.ts`). Without a visible, loaded origin
   the lightbox only fades.
   A lightbox of several pictures is `MediaLightbox`
   (`src/components/ModalSurface/MediaLightbox.tsx`; the gallery and the
   media of a card page), the same `ModalSurface zoom` with its own gestures
   (`swipeClose={false}`): the picture track slides over `--motion-base` on a
   page turn (arrows, keys, swipe), a swipe down closes with the backdrop
   dimming in proportion, a pinch and a double tap zoom, a zoomed picture pans
   within its edges. The closing flies the picture on show back into its own
   thumbnail (the trigger with the same `data-lightbox-src`), or fades when
   that is off screen. The neighbours of the picture on show are mounted
   beside it and preloaded; `ModalSurface` offers `closingTargets` for this.
6. Reduced motion: no route entrance (as before); views drop the old view at
   once and fade the new one in (160 ms); list items and view entrances fade
   without travel; modals keep the existing reduced-motion rule (no
   animation), and a zooming lightbox only fades (`--motion-fast`); so does
   `MediaLightbox` for paging, swiping and closing (a swipe is read but does
   not carry the picture).

Verification: `tests/transition-presets.test.ts` (preset choice, entering
frames, reduced motion, modal docking), `ViewSwitch.stories.tsx` (no motion on
first render, mode switch, tabs, card filter), the route entrance in
`tests/next-page-transitions-browser.test.mjs`, the bundle budgets and the
release browser checks for layout stability.

### Phone navigation speed (2026-10-20)

Production (release 51d3637b, 412×915, 4× CPU, Slow 4G) took a median 1.56 s
from a menu tap to the destination, with the old page frozen: no preparation on
touch, then the RSC response, then the route's code requested only after it.
On desktop a click during a hover prefetch downloaded the page twice.

1. A primary mouse press prepares the route at once with the full strategy,
   about 100 ms before its click; the hover dwell is `--motion-fast`. A touch
   may start a scroll, so it prepares only a menu or opted-in link whose route
   is not already being learned, and never counts as a hover.
2. Menu links (`.arena-sidebar`, the open `#arena-mobile-menu`) and links a page
   marks with `data-route-prefetch` learn their route once each when visible,
   after the browser is idle, with Next's `AUTO` strategy: a prerendered page
   with its RSC payload and code, a dynamic page only its tree (about 1.5 KB).
   On a phone the drawer opens about half a second before a tap, too late for
   a slow network, so all drawer links learn their routes at idle after load.
   Offline, Save-Data and 2G suppress all speculation.
3. Next does not join a navigation to a full prefetch still downloading; it
   renders the page again. `observeRouteResponses` (public adapter) observes
   the router's own complete page fetches by path and query, and a click to
   that page waits for the response on its way (at most 2.5 s) instead of
   requesting it again. The wait runs outside React, so Back or a newer click
   wins at once; the menu marks the waiting destination and the progress bar
   shows. Partial and segment prefetches are left to Next.
4. `/tierlist`, `/classes`, `/legendaries`, `/heroes`, `/standard/matchups`,
   `/standard/vicious-gold`, `/battlegrounds/tier-list` and `/guides-archive`
   load their data in the browser, so they are prerendered with
   `seoStaticPageMetadata` and regenerated every 300 s (`revalidate`), which
   also replaces the build's disabled runtime switches. Their document keeps
   `private, no-cache` from `documentCaching.mjs`. The query robots of
   `/battlegrounds/tier-list` and `/guides-archive` are sent as `X-Robots-Tag`
   by `next.config.mjs` (from the route inventory) and by the nginx SEO map;
   `tests/next-prerendered-robots.test.mjs` fails when a prerendered page with
   a query policy lacks the header. Pages with server reads, cookies,
   `headers()` or query-dependent server output stay dynamic.
5. After a link navigation commits, focus moves to `#main-content` without
   scrolling, unless the reader has focused something else meanwhile. Header
   search card results and the sign-in step of header, article list and article
   card actions use the router (`openPage` in
   `src/shared/navigation/pageNavigation.ts`) instead of a document load.
6. Evaluated and deferred: `loading.tsx` per route family would let a tap paint
   at once, but the header, footer and frame are rendered by every page
   (`PublicPageShell`), so each fallback would duplicate that shell with
   per-page width variants, and it would replace the contract that content stays
   until the destination is ready. Moving the shell into the persistent layout
   needs every page client to declare its frame options; both are follow-ups.
   A build-time route-to-chunk map could start route code for a page that was
   not prepared; prepared and prerendered pages already have it.

Measured on one local stand (production build of each tree, public API reads
from production, 412×915, 4× CPU, Slow 4G; 3 runs × 6 menu taps), tap to
committed destination: origin/main median 1.53 s (`/tierlist/` 2.3–2.6 s,
`/classes/` and `/legendaries/` 1.4–1.5 s, `/guides-archive/` 1.4–1.5 s);
this change median 0.36 s (those pages 0.21–0.45 s). `/standard/cards/`
(2.1–2.4 s) and `/articles/` (1.6–1.8 s) render their data on the server and
are unchanged; no page was downloaded twice. Idle route learning on a phone
costs about two small requests per drawer link. The adapter adds 0.3–1.3 KB
gzip of JavaScript per route; exceeded ceilings in
`config/next-bundle-budgets.json` were raised by the 2% and 1 KiB rule.

Verification: `tests/next-navigation.test.ts` covers press, dwell, viewport
preparation, joining by path and query and `openPage`; the browser suite
asserts idle menu preparation, no page download on a crossed link or under
Save-Data, a click during a hover prefetch with a single page request, and
Back winning at once over a waiting click. Reviewed
`docs/architecture/module-boundaries.md`: shared navigation primitives stay
framework-independent; the Next-specific response observer stays in the
public adapter.

### Main menu feedback, compact rail and header palette (2026-10-21)

The menu looked and felt slower than the router: a press showed nothing until
its click and the optimistic transition, the current item was only a darker
row, mode headings had no emblem, opening «Разное» collapsed «Конструкторы»
and moved the control under the pointer, and the phone menu was a drop-down
panel without a swipe.

1. Pressed feedback. A primary press on a menu link sets `data-nav-pressed` on
   the anchor in a capture listener (`usePressedNavigationLink`), without a
   React render: the gold indicator moves on the next frame and the previous
   current item steps back (`:has()`). A scroll gesture (`pointercancel`), a
   release elsewhere or the committed or optimistic current page clears it.
2. Current item. A gold bar on the left edge (transform and opacity only), a
   parchment-tinted row and a gold icon tile mark `aria-current="page"`.
   Mode headings carry an emblem (Традиционный режим, Арена, Поля Сражений);
   the decorative captions under modes and groups are gone.
3. Groups open independently and the group holding the current page starts
   open, so its item is visible on arrival; a closed group still releases its
   layout in the same commit.
4. Compact desktop rail. The toggle next to the brand switches an 84 px icon
   rail. `src/app/shell/navigationPreference.ts` stores the choice in
   `localStorage` (`hp:nav:compact`) and an inline head script in
   `app/layout.tsx` applies `data-nav-compact` to `<html>` before the first
   paint, so the workspace never shifts after hydration; React reads the
   attribute through `useSyncExternalStore` (expanded on the server). One
   fixed tooltip (`useNavigationTooltip`) names the hovered or focused item and
   its mode («Тир-лист · Арена»); items keep their accessible names.
5. Honest badge. «Новый» next to Патчноуты only while the newest dated patch of
   `/api/patch-notes` is at most 14 days old and this browser has not opened
   the patch notes since it was published. The archive is read once the
   browser is idle (not under Save-Data), cached for 30 minutes; nothing is
   shown while it is unknown.
6. Phone drawer. The drawer is a full-height panel from the left edge under the
   top bar, sliding on `translate` over `--motion-base`. A horizontal swipe
   towards the edge follows the finger and closes it past 30 % of its width or
   on a flick (`useDrawerGesture`); vertical moves stay a native scroll
   (`touch-action: pan-y`). It keeps its scroll between openings and on the
   first opening centres the current page. Links are at least 48 px tall. The
   focus trap, Escape, the outside tap and the back/forward-cache close are
   unchanged.
7. Header palette. The header search is the site's command palette: `/`,
   Ctrl+K or ⌘K focus it from anywhere and open a list of recent picks
   (`hp:search:recent`, five same-site entries) and every section in menu
   order (the mode is printed only for a repeated name such as «Тир-лист»);
   typing narrows the sections at once and adds archetypes (public
   catalog teaser, Standard and Wild), cards and articles (`/api/search`).
   Arrow keys move a highlighted row named by `aria-activedescendant`
   (Valyro `useListNavigation`, already vendored), Enter activates it. Rows
   are real links (articles stay buttons that open a new tab through the
   existing access-link flow); subscription locks are unchanged. Valyro's
   modal `CommandPalette` was not vendored: it would duplicate the header
   field and its QA and paywall contracts.

Measured on the local QA runtime against a build of the base commit, five
interleaved rounds of five runs (production builds, fixture API, 4× CPU, a
shared server; medians of the round medians; `/articles/` → Мета): first
frame with visible feedback after the press, desktop (mouse held 60 ms)
93 → 17 ms and phone (tap) 37 → 5 ms; `aria-current` follows the click as
before (about 95 ms desktop). Event duration of the menu interactions (INP
proxy, 8 ms granularity) 40 → 48 ms desktop and 88 → 80 ms phone; drawer
fully open 323 → 318 ms; LCP 252 → 248 ms desktop and 144 → 156 ms phone,
within the run-to-run spread; CLS 0 in both. Toggling the rail and opening
groups follow input, so they are not counted as shifts.

Verification: `tests/public-navigation-shell.test.tsx` (emblems, badge,
independent groups, rail toggle), `tests/navigation-badges.test.ts`,
`tests/search-palette-model.test.ts`, the drawer swipe and scroll memory in
`tests/next-mobile-menu-browser.test.mjs`, the group contract in
`tests/next-page-transitions-browser.test.mjs`, and the Storybook stories
`App shell/Public navigation` (compact rail, badge, independent groups) and
`App shell/Search palette`.
