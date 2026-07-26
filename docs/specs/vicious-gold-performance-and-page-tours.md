# Vicious Gold performance and page tours

## Problem

`/standard/vicious-gold` blocks the whole subscriber page while the server
enriches every archetype with a deck code and a localized card list. A cache
miss can invoke multiple 30-second HSGuru fallbacks, although the class
distribution and Power Tier data are already available.

The contextual Help system covers the archetype catalog only with generic Meta
wording and does not cover an individual archetype page.

## Required behavior

- Render the Vicious Gold summary, distributions and Power Tier as soon as their
  dataset is available.
- Fetch deck codes and card compositions in a separate protected request. A
  slow or failed build request must not hide the statistical page.
- Show an honest inline loading or unavailable state for build actions; retain
  copy and deck composition behavior after enrichment.
- Preserve subscription checks and `Cache-Control: no-store` on both API responses.
- Refresh the catalog tour with page-specific controls and add a distinct tour
  for archetype detail pages, including the teaser/paywall variant.
- Tours remain concise, keyboard accessible, mobile-safe and manually
  restartable from Help.

## Tour rollout plan

### Coverage inventory

- **Meta, matchups and Vicious Gold:** covered. Refresh the wording whenever
  filters or loading behavior changes.
- **Archetype catalog:** covered, but generic before this change. Replace it
  with page-specific format, search, sort and result steps.
- **Archetype detail:** missing before this change. Add summary, main build,
  analysis, history and alternative-build steps.
- **Card catalog and card detail:** covered. Audit after the next statistics
  redesign.
- **Arena classes, tier list and legendaries:** covered. Keep.
- **Battlegrounds heroes, library, tier lists and builders:** covered. Keep.
- **Profile and access setup:** covered. Validate after subscription changes.
- **Deck builder and contests:** missing. Add in P1 because both are multi-step
  interactive workflows.
- **Articles, gallery and guides archive:** missing. Add in P2 only where
  filters or discovery controls need explanation.
- **Home, FAQ and simple article readers:** missing by design. Clear labels are
  more useful than an interrupting tour.
- **Admin workspace:** partial contextual help only. Audit separately as an
  internal-operations project.

### Delivery order

1. **Current release:** update Vicious Gold and the archetype catalog; add the
   archetype detail tour.
2. **Next P1 pass:** add tours to public creation and account flows that have
   several interactive controls: deck builder, contests and access setup.
3. **P2 pass:** add short tours to content discovery surfaces where filters are
   not obvious: articles, gallery and guides archive.
4. **Do not add tours** to static FAQ, simple article readers or one-action
   pages. Prefer contextual labels there to avoid unnecessary interruption.

Every new tour must have stable `data-tour-id` anchors, 3–7 steps, mobile copy
where behavior differs, a version bump when meaning changes, registry tests and
desktop/mobile browser QA.

## Acceptance checks

- Guest production trace remains fast and the subscribed first useful screen
  is no longer coupled to HSGuru deck fallback latency.
- Build enrichment endpoint has route/access tests.
- Vicious Gold remains usable when build enrichment fails.
- Catalog and detail URLs resolve to different tours and every step has a
  rendered anchor.
- TypeScript, focused tests, full build, accessibility and responsive browser
  checks pass.
