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
- While builds load or when they fail, decks show no build action; copy and
  the deck block appear with the enrichment.
- Preserve subscription checks and `Cache-Control: no-store` on both API responses.
- The Next.js HTML route renders a public description without protected
  statistics. Its client mounts the existing statistics view only after the
  `standard` entitlement or administrator access is verified; account changes
  remount the view. The view is a chunk of its own (`ui/lazyPaidView.ts`), so
  a guest downloads only the banner and the gate; a remembered session starts
  the download during the access check, and the banner and loader hold the
  place until it arrives. Its public Nginx owner is Next.js; both protected APIs
  remain on Express.
- Refresh the catalog tour with page-specific controls and add a distinct tour
  for archetype detail pages, including the teaser/paywall variant.
- Tours remain concise, keyboard accessible, mobile-safe and manually
  restartable from Help.

## Page layout

- The access check, the guest gate, the loader, the error panel and the
  statistics render the same banner, and the loader holds at least one screen.
  A subscriber's first screen therefore does not move when the statistics
  arrive. The banner keeps two facts: games and the vS data window.
- Under the banner a report plate (the archetype dossier's red plate, the
  Power Tier leader's class art as a narrow strip hidden on phones, so it
  never outgrows the preloaded banner as the LCP element) names the window
  (`timeRanges`, e.g. `lastDay` = «последние 24 часа»), the update time in
  Moscow time, the games and the source link, lists the sections as anchors
  and shows a VaryloUI KPI strip: Power Tier leader, most played archetype,
  most played class and the number of archetypes from 0.5%.
- Power Tier comes first. The rank brackets are one row of tabs (scrolling
  inside the row on phones) and the class is a select. Decks are grouped into
  the site tiers S–D with `TierBadge`, using the meta page's floors
  (`STANDARD_META_TIER_FLOORS`: S from 53%, A from 51%, B from 49%, C from 47%)
  on the vS power win rate itself: vS publishes no games per archetype, so
  there is no Wilson bound. Each row shows rank, class, name, a bar diverging
  from 50% (±10 points fill a half), the win rate and, in a bracket other than
  all ranks, the difference in points to the same deck in all ranks.
- Meta shares and decks are one section. Each class is a row: its icon, name
  and share in large type, then a stacked bar that is the class's own 100%,
  split into its archetypes, largest first, in shades of the class colour
  (`classShareRows`: the largest the deepest, lighter steps up to 55% white, a
  mid-tone nudged until its text reaches 4.5:1). A segment writes its name
  without the class word and its share when they fit, the share alone or
  nothing when not; its title always has both. Archetypes below 0.5% stay one
  hatched remainder. A class filters the archetype list under the bars: one
  flat list (the first 12, then «Показать все»), search and class filter,
  class icon, name, share bar and percentage. A deck with a build gets the
  graphical «Скопировать код колоды» button and «Колода», which opens the
  archetype page's deck block (`ConstructedArchetypeDeckGallery`: render, card
  list, copy) with its source. A deck without a build shows nothing.
  Stacked bars replaced a class -> archetype treemap: at 412 px most of its
  tiles had no room for a name.
- Names: the server matches every vS archetype to our HSGuru archetype catalog
  (`findViciousGoldCatalogItem`: the vS name, its alias, then the HSGuru
  spelling `DK`/`DH`/`Harold` and the `-lock` short form). A match gives the
  catalog's Russian name (as on the meta and archetype pages) and
  `archetypeSlug`, so the row links to `/standard/archetypes/standard/<slug>/`;
  the vS name stays as a small caption. The same match picks the catalog build.
  The summary waits at most 3 s for a cold catalog and then falls back to the
  translation table without links, caching that answer for 30 s only.
- Not shown, because the source has no such data: a matchup matrix (hs-data-api
  computes the vS table to derive Power Tier but does not publish it), change
  since a previous report (no history is kept) and a report number (Data Reaper
  Live is a live dashboard).
- `tests/vicious-gold-layout-browser.test.mjs` checks the report, the tiers,
  the links, the bracket deltas, the filters, accessibility, touch targets, the
  layout shift and the phone scroll height with
  `tests/fixtures/viciousGoldPayload.mjs`; `scripts/e2e-qa.mjs` covers the
  copy artwork, the deck block and the class-to-deck flow.

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

The class ranking tour has two steps after removing its duplicate source row.
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
