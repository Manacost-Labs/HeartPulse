# Public client navigation

## Goal and acceptance

Public page links use the Next.js App Router after hydration. The navigation
mounted by the root layout keeps its DOM, expanded groups and sidebar scroll
position between public pages. The mobile drawer closes on navigation without
losing the page's scroll position. Content remains visible until the destination
is ready, then softly settles to full opacity without moving its geometry.

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
3. Keep document loads and individual page sections free of entrance effects;
   use one short content transition after a client route commits.
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

1. Guard speculative loading: pointer intent must last 120 ms, leaving the
   link cancels it, keyboard focus prepares immediately, and touch, offline,
   Save-Data and 2G connections do not prefetch. Current-page links and fragment
   variants share no redundant request. Keep at most 32 fresh route markers;
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

Next.js 16.3.8 and React 19.3.0 are the installed dependencies. App Router
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
   Preserve the 120 ms dwell, focus preparation, network restrictions,
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

### Fade-through, immediate feedback and revisits (2026-10-18)

The owner found the committed-route settle (opacity 0.8 to 1) reading as a
flicker and the site slow and unstable. From four previewed variants the owner
chose the fade-through: the outgoing content clears, then the destination
fades in, while navigation, header and background stay still.

1. `RouteContent` wraps the shell's `data-route-content` box in a React 19.3
   `ViewTransition` named `route-content`. Its class applies only to
   transitions typed `route-navigation`, which the bridge adds with
   `addTransitionType` when the pathname changes. Back/Forward, refreshes,
   query/hash-only pushes, in-page transitions and reduced motion never start
   a view transition. The old box clears in `--motion-instant`, the new one
   fades in over `--motion-fast` after it (230 ms in total).
2. Only the box is captured (`html { view-transition-name: none }` and
   `::view-transition { pointer-events: none }`), so the rest of the page stays
   live: menu clicks during the transition navigate. Chromium does not deliver
   pointer input to a captured element, so the box itself takes clicks again
   once it has faded in. The persistent `RouteTransition` reads the outgoing
   box position before the commit (`getSnapshotBeforeUpdate`) and, after the
   router has scrolled the destination to the top, sets `--route-old-shift`
   so a page left from below the fold fades out where the reader saw it.
3. The persistent layout marks the chosen destination current at once with
   `useOptimistic`; the committed pathname replaces it. A mouse press prepares
   the route immediately, like keyboard focus, so a quick click does not wait
   for the 120 ms dwell. Next reuses an in-flight full prefetch only after its
   route tree has arrived (`navigateUsingPrefetchedRouteTree` waits on pending
   segments; an unknown route issues its own request), so earlier preparation
   narrows the window in which a click duplicates the server render.
4. `staleTimes.dynamic` is 30 seconds: public pages render anonymously (only
   `adminAccess.ts` reads cookies), so a page opened within that time is shown
   from the router cache. Back/Forward already reused it.
5. `NavigationProgress` keeps its 200 ms delay, then grows from the start edge
   while the route loads and fills and fades on completion instead of
   vanishing; the infinite pulse is removed. Reduced motion shows it without
   motion.

React starts a document view transition for every transition commit that
mounts a `ViewTransition`, so Back/Forward and reduced motion also run one, but
with nothing captured it shows no motion. Inside the boundary React holds a
transition commit until new eager images have decoded when they can arrive
soon (at most 800 ms, 50 ms for heavy images), so pictures do not pop in after
the swap. The captured box takes no pointer input until it has faded in.
Verification: `tests/next-page-transitions-browser.test.mjs`
asserts the two pseudo-element animations and their timing and that nothing
else animates, the shift of a scrolled page, a menu click during the
transition, and Back and reduced motion without any view-transition motion;
`tests/next-navigation.test.ts` covers press preparation.
Eight route ceilings in `config/next-bundle-budgets.json` were raised by the
2% and 1 KiB rule for the added stylesheet (at most 180 gzip bytes per route).
Reviewed `docs/architecture/module-boundaries.md`: ownership and dependency
direction remain accurate.
