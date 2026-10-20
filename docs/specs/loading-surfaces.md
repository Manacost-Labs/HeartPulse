# Loading surface geometry

Loading placeholders reserve the structure of the view that replaces them.
Measure the rendered content before choosing dimensions. Preserve the loaded
view's responsive grid, media ratio, padding, borders and fixed controls.
Do not give loaded cards a fixed height to make them fit a placeholder.

## Ownership and states

`LoadingSurface` owns one polite status; `LoadingBlock` owns the placeholder
fill, opacity animation and reduced-motion behavior. Domain owners provide
geometry. Placeholders contain no links, buttons, fabricated statistics or
publicly exposed headings. Any real chart chrome used for sizing is inside
an inert, hidden subtree. The status must remain outside an initially busy
region so assistive technology can announce it.

Every public loading state is a `LoadingSurface`/`LoadingBlock` composition;
the legacy `.skeleton` class, page spinners and plain-text loaders are gone.
Spinners remain only on in-flight controls (search, submit). A gallery has one
status for the whole grid; its cards are hidden blocks. Copy is
«Загружаем …» without an ellipsis.

Keep public class rows visible while their existing data refreshes. Initial
loading uses placeholders; a refresh, filter or page change keeps the shown
content as a dimmed `data-surface` with `aria-busy`. Content already rendered
by the server (contests, guide detail, BG hero and card detail teasers) stays
visible during a signed-in viewer's personal fetch; only the missing parts get
placeholders. A list never shows a zero count while its total is unknown.
Skeleton changes do not change fetches, entitlements, subscription gates,
navigation or the ready view's typography.

## Timing and deadlines

The reserved geometry appears at once, but the placeholder fill fades in only
after `--loading-reveal-delay` (160 ms), and a refreshing `data-surface` dims
after the same delay, so a cached or fast response never flashes a skeleton.
Data already held in memory (cosmetics ETag cache) renders on the first
frame. Client loaders use `fetchWithDeadline`; a stalled request ends in an
error state with «Повторить» instead of an endless placeholder. An inert
locked preview keeps its placeholders still.

- **Articles**: Actual card frame, 1176:597 cover, metadata and voting controls;
  a reference headline of three lines.
- **Arena classes**: Leader frame, 11 rows and the same ledger spacing; desktop
  leader about 85 px, normal row 68 px; phone leader 118 px and normal row about
  99 px.
- **Deck builder**: Actual 360:497 image, border, 32 px action and 8 px bottom
  padding; the heading counter is the single status, busy only on refresh.
- **Tier list**: Real controls row, class slots and two tier groups of 512:776
  card cells; the source switcher stays live.
- **Legendaries**: Real group cards (144 × 218 key card, companions, four
  metrics) on the first-page grid; visitor copy for empty and error states.
- **Card catalog**: Real gallery tiles or table frame; the search count is a
  placeholder until the first page arrives.
- **Card detail**: Back control and the real hero columns, including the public
  locked statistics; no placeholder heading.
- **Meta deck modal**: Presentation switch, deck list and image stage.
- **Sign-in and connect**: Real login card and connect view frame; static copy
  is transparent generated text so fills wrap like the real text.
- **Battlegrounds**: Hero detail reliquary, stats and ledger; card dossier;
  hero tiers and library tiles from the real classes.
- **Archetype catalog**: Ledger frame and header; rows 88 px, about 130 px at
  tablet width and about 175 px on phones.
- **Archetype core/history/analysis**: Independent sections, each with a fitted
  skeleton (build gallery, history charts, matchup/mulligan panels); builds keep
  the one-viewport reserve. Sections mark `data-loading`, never `aria-busy`.
- **Archetype build gallery**: Existing preview container and five card rows;
  rendered deck art and expanded lists have variable height.
- **Fun deck catalog**: Actual card frame, 62 px identity, metrics, square
  preview, copy action and source footer; six cards, the first visible page.
- **Fun deck composition**: Existing 500 px composition region and ten rows;
  rendered art can replace it independently.
- **Cosmetics catalog**: Real tile padding, 2:3 media and two-line name region,
  the results line and the 48-item first page; no stretched 760 px grid.
- **Cosmetics detail**: Separate portrait, coin and pet state; same back
  control, banner, hero columns and measured image/copy geometry.
- **Guide catalog**: Actual responsive grid, 16:9 cover, card frame, metadata
  and text regions; the 18-item page.
- **Guide detail**: The server teaser seeds the back control, banner and header;
  only the body reserves the first reading viewport.
- **Gallery**: Actual grid, 1.39:1 preview, frame, reference text, metadata and
  download control.
- **Contests**: Actual responsive card grid, 2:1 media, title, description,
  metadata and action.
- **Card history**: Real chart frame and title wrapping, summary, 240 px plot
  and measured selection controls.
- **Expanded meta chart**: Real frame, controls, hint, responsive 400/340 px
  plot and selection panel; plotting code stays deferred.
- **Matchups**: View switch, picker, quick filters, search and three responsive
  matchup groups.
- **Vicious Gold**: The real dashboard (nav, class chart, deck rows, Power Tier
  tabs and cards) inside the one-viewport reserve.
- **Home latest articles**: Real responsive lead/secondary grid, 16:8.5 covers,
  metadata, headline, excerpt and action; keep known articles during refresh.
  The lead spans the full tablet row.
- **Home deferred code**: The latest-articles section skeleton (heading, board,
  link row), loaded eagerly with the section stylesheet.
- **Recoverable/lazy surfaces**: Generic status panel only until the owning
  layout is known; page/section containment owns its minimum height.

Short and long text, unknown result counts, optional metadata, image intrinsic
sizes and unbounded articles cannot have one exact pre-fetch height. Reserve
a measured reference within real short/long content ranges and the first
viewport. Do not promise an identical total document height for unknown data.
Archive absence and account access must never be inferred from placeholder
content. Routes whose proxy probe waits for the server before rendering
(cosmetics, card and BG details) keep the previous page until the answer and
show no skeleton for that wait.

## Verification contract

`tests/skeleton-geometry-browser.test.mjs` compares real ready and loading
stories at 1350, 1024, 768, 412 and 360 px;
`tests/archetype-vicious-skeleton-geometry-browser.test.mjs` covers archetype
sections and Vicious Gold. `tests/skeleton-route-geometry-browser.test.mjs`
runs the production Next build against held fixture responses
(`tests/helpers/skeletonRouteFixtures.mjs`) at 412×915 and 1440×900, compares
skeleton and loaded parts of real routes and requires zero layout shift across
the swap. `tests/public-loader-deadline-browser.test.mjs` proves that stalled
loaders end in a retry state. Fixed structures must agree within
2 px in width and 4 px in height. Variable headlines, cosmetic names, guide
text, gallery descriptions and matchup groups use real short/long states as
bounds; fixed article chrome is compared separately.

Wait for fonts, finite animations and visible content. Scroll lazy cards into
view and move the pointer away. A hidden details element, skipped
`content-visibility` layout, pending lazy import or hover transform is not a
valid loaded measurement. Preserve failed attempts and repeat them under the
same conditions. Runtime review additionally checks overflow, console/network
failures, accessibility and reduced motion.

See [the sizing runbook](../runbooks/skeleton-ui-sizing.md).
