# Measure and fit skeletons

Use [the loading contract](../specs/loading-surfaces.md) when a page's loading
state differs from its ready layout. Keep measurements and fixes in the same
task; record the exact code and production SHA separately.

## Measurement procedure

1. Use Playwright to open the ready public page or an isolated, documented
   subscription fixture. Test desktop, tablet and phone widths; include short
   and long content, empty/error states, initial loading and refresh with data.
2. Wait for fonts and actual loaded controls. Expand charts/details. Scroll
   lazy cards into view, move the pointer away and let finite animations end.
3. Record bounding boxes for the card and its media, padding, borders, text
   and controls. Record loading and ready states separately, including URL,
   viewport, state and source SHA. Keep screenshots and failed attempts.
4. Fit the owning skeleton to those parts. Reuse `LoadingSurface` and
   `LoadingBlock`; preserve ready-state layout and permissions. Retain a
   bounded region when data length or image ratio is unknown.
5. Compare both states in the real browser. Check all affected viewports,
   accessibility, console/network errors, overflow and reduced motion.

Use the Playwright skill's CLI wrapper; no application dependency is needed.
Keep browser sessions isolated and close only sessions created by the task.
Use the configured Storybook hostname. If development indexing becomes stale
during edits, restart the task's own server or use a stable static build.
Do not rebuild `storybook-static` while a measurement is reading its assets.
An attempt overlapping that rebuild is invalid evidence and must be repeated.

## Regression checks

```bash
npm run build-storybook
CHROMIUM_PATH=/usr/bin/google-chrome node --test tests/skeleton-geometry-browser.test.mjs
CHROMIUM_PATH=/usr/bin/google-chrome node --test tests/archetype-vicious-skeleton-geometry-browser.test.mjs
CHROMIUM_PATH=/usr/bin/google-chrome node --test tests/public-loader-deadline-browser.test.mjs
npm run build:next
SKELETON_SCREENSHOT_DIR=<artifact-dir> CHROMIUM_PATH=/usr/bin/google-chrome \
  node --test tests/skeleton-route-geometry-browser.test.mjs
npm run test:storybook
npm run test:registry
npm run lint
npm run lint:next
npm run lint:architecture
npm run quality:clean-code:changed
npm run security:semgrep
```

Run the Next build and existing bundle ceilings after changing page imports or
CSS. Run React Doctor on tracked changes and review new diagnostics. A browser
review with the isolated Chrome DevTools MCP follows automated checks.
Storybook instructions come from the local MCP; preview each changed state.

The Storybook bootstrap loads route styles before parchment overrides, as the
public app does. Domain stories must not import legacy page CSS across module
boundaries. Keep that composition in `.storybook/preview.tsx`.

## Real-route measurement

The route test serves the production Next build behind the public gateway
against a fixture backend, blocks every non-local request and telemetry, holds
each route's data request to capture the skeleton, then releases it. A route
is a row in `tests/helpers/skeletonRouteFixtures.mjs`: path, fixture answers,
the held request, optional click navigation and the measured parts (`fixed`,
`text` with a short-text fixture, `viewport` or `width`). `SKELETON_ROUTES`
selects rows; `SKELETON_SCREENSHOT_DIR` keeps skeleton and loaded screenshots;
`SKELETON_REPORT` writes the measurements. Fixtures must use the real API ids
and the real first-page size, or the comparison measures the fixture.

## 20 October 2026 evidence

On release `51d3637b` the route test found grids shorter than the first page
(fun decks 3 of 6 cards, guides 6 of 18, cosmetics 12 of 48 and no results
line) with CLS 0.12, 0.07 and 0.09 at 1440×900, and a class row that grew when
«Охотник на демонов» wrapped. After fitting, every covered route swaps with
CLS 0 at 412×915 and 1440×900.

## 19 October 2026 evidence

The initial measurements used production release `e98cfb35`, Playwright and
Chrome 150, plus the project's local subscription fixtures. Public and loaded
private states were kept separate; missing fixture endpoints were not counted
as production failures. Additional ready/loading stories covered public
gallery cards, contests, expanded card history, the meta chart and guide
detail. Expanded history, meta, guide and matchup states were measured at
five widths; gallery and contest references used three widths before fitting.
The paired regression then covers all five widths: 60 state pairs across
12 layout families. A follow-up Playwright pass measured the home feed in
ready, long text, initial loading, refresh and empty states at all five widths
before replacing its fixed-height placeholders.

Selected mismatches that motivated the changes:

- **Home latest articles**: Fixed 390 px cards → The real grid and cover;
  the tablet lead measures about 569 px at 768 px and 700 px at 1024 px.
  Short/long articles bound the reference body; refresh retains real cards.
- **Archetype rows**: 76 px at every width → 88 px desktop, about 130 px tablet,
  175–192 px phone depending on title.
- **Class leader**: 72 px desktop / 64 px phone → About 85 / 118 px.
- **Articles**: Fixed 288 px → About 381–407 px for a three-line reference
  headline.
- **Guide cards**: Four full-width 56 px rows → Grid cards about 349–376 px in
  the local fixture.
- **Gallery card on phone**: 340 px → About 490–577 px for short/long text.
- **Contest card on phone**: 188 × 141 px tile → About 386 × 498 px; completed
  cards can be taller.
- **Expanded card history**: 230 px → About 508–598 px across five widths.
- **Expanded meta chart**: One approximate plot row → About 676–800 px including
  controls and selection.
- **Cosmetic detail**: Catalog grid → Hero about 518/901 px, coin 406/639 px and
  pet 505/637 px, desktop/phone.

Production font wrapping and result counts are data-dependent. These are
reference measurements, not universal fixed heights. The paired regression
checks use actual components and short/long fixtures rather than assertions
that repeat the skeleton CSS. First-view measurements that used offscreen
intrinsic sizes were superseded by visible-card measurements.

Raw measurements, screenshots, browser logs, discarded attempts and the final
report belong in the task artifact directory, not the authored source tree.
The separate site-performance audit must finish against one deployed SHA;
do not combine HTTP results across a release switch. See
[the performance runbook](site-performance.md).
