# Public client navigation

## Goal and acceptance

Public page links use the Next.js App Router after hydration. The navigation
mounted by the root layout keeps its DOM, expanded groups and sidebar scroll
position between public pages. The mobile drawer closes on navigation without
losing the page's scroll position. Content changes without fading to the
background or rising into place.

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
3. Remove the document transition/entrance from the public layout and stop
   page entrance animations from replaying during client navigation.
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
