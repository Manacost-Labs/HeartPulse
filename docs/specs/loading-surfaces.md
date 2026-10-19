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

Keep public class rows visible while their existing data refreshes. Initial
loading uses placeholders; error, empty and retry states keep their existing
product behavior. Skeleton changes do not change fetches, entitlements,
subscription gates, navigation or the ready view's typography.

- **Articles**: Actual card frame, 1176:597 cover, metadata and voting controls;
  a reference headline of three lines.
- **Arena classes**: Leader frame, 11 rows and the same ledger spacing; desktop
  leader about 85 px, normal row 68 px; phone leader 118 px and normal row about
  99 px.
- **Deck builder**: Actual 360:497 image, border, 32 px action and 8 px bottom
  padding.
- **Archetype catalog**: Ledger frame and header; rows 88 px, about 130 px at
  tablet width and about 175 px on phones.
- **Archetype core/history/analysis**: Existing independent bounded region;
  first build reserves one viewport; optional content remains independent.
- **Archetype build gallery**: Existing preview container and five card rows;
  rendered deck art and expanded lists have variable height.
- **Fun deck catalog**: Actual card frame, 62 px identity, metrics, square
  preview, copy action and source footer.
- **Fun deck composition**: Existing 500 px composition region and ten rows;
  rendered art can replace it independently.
- **Cosmetics catalog**: Real tile padding, 2:3 media and two-line name region;
  no stretched 760 px loading grid.
- **Cosmetics detail**: Separate portrait, coin and pet state; same back
  control, banner, hero columns and measured image/copy geometry.
- **Guide catalog**: Actual responsive grid, 16:9 cover, card frame, metadata
  and text regions.
- **Guide detail**: Same back control, banner and header; reserve the first
  reading viewport rather than guessing article length.
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
- **Vicious Gold**: Existing one-viewport reserve and 104 px rows; result count
  stays data-dependent.
- **Home deferred sections**: Existing 18 rem region while optional code/data
  arrives.
- **Recoverable/lazy surfaces**: Generic status panel only until the owning
  layout is known; page/section containment owns its minimum height.

Short and long text, unknown result counts, optional metadata, image intrinsic
sizes and unbounded articles cannot have one exact pre-fetch height. Reserve
a measured reference within real short/long content ranges and the first
viewport. Do not promise an identical total document height for unknown data.
Archive absence and account access must never be inferred from placeholder
content. The unused private `DeferredRoutes` skeleton definition has no active
consumer and is not a separate page-loading implementation.

## Verification contract

`tests/skeleton-geometry-browser.test.mjs` compares real ready and loading
stories at 1350, 1024, 768, 412 and 360 px. Fixed structures must agree within
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
