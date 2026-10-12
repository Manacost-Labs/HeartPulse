# Card catalog first-load performance

## Baseline and scope

On 2026-10-12, an isolated Chrome review of `/standard/cards/` at 390×844,
DPR 2 and CPU slowdown 4× found six thumbnail requests before scrolling. Their
encoded bodies totaled 263,460 bytes, although the gallery began at y=1117.
The first two totaled 84,482 bytes; the extra four totaled 178,978 bytes.
The same document already supplied its catalog seed without a duplicate browser
catalog API read. Its laboratory CLS was zero on the desktop trace.

This change removes unconditional mobile requests for those four thumbnails.
It changes no thumbnail/full-image resolution or quality, HTTP/CDN cache,
dataset, entitlement or API contract. Laboratory transfer savings are not a
claim about field LCP or every viewport: observer proximity can legitimately
load extra images when the gallery is closer to the fold.

## Verification

Use an isolated task worktree with dependencies installed from `package-lock.json`.
Run these commands after rebuilding the candidate:

```sh
npm run build:static
npm run build:next
npx tsx tests/card-catalog-image-loading.test.ts
npx tsx tests/constructed-card-catalog-controls.test.tsx
node --test tests/next-cards-browser.test.mjs tests/next-runtime-config-browser.test.mjs
npm run budget:next
npm run lint
npm run lint:next
npm run lint:architecture
npm run test:storybook
npm run build-storybook
npm run security:semgrep
npm run lint:docs
```

In Chrome DevTools MCP, retain the isolated profile, approved URL patterns,
redacted headers and telemetry opt-outs. Network throttling is unavailable when
the MCP allowlist is active; keep the allowlist and report the actual conditions.
Use CPU throttling independently. Read network requests and dimensions after
navigation completes, rather than sampling the previous document.

Verify 320/390-pixel mobile and 1440-pixel desktop: identical image layout,
no overflow, source selection, search/filter interactions, scrolling to the last
card, menu navigation/Back, console and accessibility structure. Inspect the
three image stories and the existing public catalog story. Record image request
counts and bytes, with browser-cache state specified.

Browser regressions exercise first-row selection without JavaScript at every
breakpoint, mobile hydration, scrolling/resizing, and a failed CDN source whose
origin retry must remain selected after resizing. Existing gallery hover,
table renderer and filter-warming tests remain required.

## Release and rollback

Integrate only after clean session/integration preflights and the repository
checks. Follow the normal immutable-release pipeline and verify the exact
Production SHA with `scripts/production-monitor.mjs`. A rollback uses the
previous verified release; do not modify image mirrors, sessions or cache
volumes. Post the checked behavior to the public changelog helper.
