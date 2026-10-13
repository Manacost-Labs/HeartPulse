# Data visualizations

## Objective and acceptance

Make HearthPulse statistics readable, interactive and downloadable while keeping
the parchment, timber and game typography. Preserve statistics and permission gates.

- Label scales, values and units; support keyboard and touch.
- Download charts as SVG and PNG with title and HearthPulse attribution.
- Sort TanStack table values numerically and export all supplied, filtered rows
  as CSV. Native surfaces preserve existing sorting and export rendered rows,
  explicitly labelled as current rows.
- Paginate long tables without silently truncating source rows.
- Preserve missing values and actual turn gaps; count scales start at zero.
- Keep mobile labels and controls visible without page overflow.
- Count axes label unique integer ticks, including zero-only and single-game
  histories; fractional grid values must not produce repeated rounded labels.
- Observed ranges use their spread for padding; an absolute 50% level must not
  flatten a 0.01-point change. Constant series retain a finite padded scale.

## Ownership and design

Generic rendering and browser-local export live in `src/shared/ui/analytics/`.
Domain adapters supply values, units, labels and icons through props; they perform
no requests or permission checks. Hero adapters live behind the Battlegrounds
module's public contract. Legacy views compose the adapters.

TanStack Table 8.21.3 provides sorting and row models through the documented
[v8 API](https://tanstack.com/table/v8/docs/guide/sorting). Charts use native SVG.
Export loads no external services. Parchment #f7e8bf, ink #30251c, muted #735e49,
violet #64416f and gold #d9ab49 retain the site's identity. Use HSDisplay for titles
and Inter with tabular numerals for data. Avoid repeated pill frames and gradients.
Hero power uses a labelled observed range rather than an unlabelled 0–100 canvas.

## Implementation sequence

1. Shared scales, CSV protection, image export and line/bar charts; test missing
   data, constant series, coordinate gaps and downloads.
2. Hero and card-round analytics; migrate tables and remove the 24-row truncation.
3. History, matchup matrix and meta map; inventory remaining tables and diagrams.
4. Run automated checks, Storybook and Chrome DevTools desktop/mobile review.

## Coverage

- Hero placements, power, tavern distribution, compositions and full power table.
- Minion round impact, combat winrate, placement and sample-count charts/table.
- Card history, arena archetype history and constructed archetype history.
- Meta scatter with popularity filtering and exact archetype selection.
- Matchup matrix: quieter colours, sticky labels, original scroll controls,
  native accessible table and CSV/PNG/SVG export.
- Mana curve and Vicious Syndicate class distribution; class filtering remains.
- Arena class ranking: true 0–100% meters, plus an expandable shared chart with
  sample counts and PNG/SVG export. CRM overview: two dated, downloadable count
  charts replace the unlabelled miniature sparklines.
- All native tables in card catalogs, meta, arena ratings, mulligan analysis,
  admin people/content/translations/integrations and parser runs.
- Inline placement indicators retain their compact role; zero-height bars are
  no longer artificially enlarged. Full downloadable distributions live in
  hero analytics, rather than adding download controls to every catalog row.

## Coverage audit (13 October 2026)

The follow-up source audit includes production `src`, Next route components and
public Battlegrounds scripts. It searches SVG/canvas renderers, native tables,
CSS percentage widths/heights, distribution variables and chart call sites;
icon-only SVGs and canvas image composition are classified separately.

| Surface | Charts | Export |
| --- | --- | --- |
| BG heroes | Places, power, tavern, tiers, compositions | PNG/SVG/CSV |
| BG creatures | Round impact, combat wins, place, sample size | PNG/SVG/CSV |
| Constructed cards | Usage, deck wins, games, played wins | PNG/SVG |
| Constructed archetypes | Winrate, popularity, games | PNG/SVG |
| Arena archetypes | Popularity, winrate | PNG/SVG |
| Standard meta | Winrate/popularity scatter | PNG/SVG |
| Standard matchups | Winrate matrix | PNG/SVG/CSV |
| Deck builder and archetypes | Mana curve | PNG/SVG |
| Vicious Syndicate | Class distribution | PNG/SVG |
| Arena classes | Winrate ranking and comparison | PNG/SVG |
| Admin CRM | Subscribers, registrations by date | PNG/SVG |
| Compact rows | Placements and inline metrics | Text and small bars |
| Parser jobs and guided tour | Completion progress | Status controls |

Compact indicators retain text values and their comparative role without
repeating download controls in every catalog row. Full chart surfaces reuse
the shared primitives; the scatter and matrix preserve domain-specific
interaction inside ChartFrame/TableSurface.

The vendor DeckView cost-curve API has no production call site; active mana
curves use `DeckManaCurve`. Public strategy/tier-builder canvases compose images
and already have image export; they are not statistical charts. The audit found
and corrected two omitted chart surfaces (Arena classes and CRM overview) and
zero-height trinket bars. Raw analytical SVG rendering now lives only in the
shared chart primitives and the framed meta scatter.

## Verification

- `node --import tsx --test tests/data-visualizations.test.ts`
- `STORYBOOK_QA_URL=http://127.0.0.1:6036 node --import tsx --test tests/data-visualizations.test.ts`
- `npm run test:registry`
- `npm run lint`, `npm run lint:next`, `npm run lint:architecture`
- `npm run test:storybook`, `npm run build-storybook`
- `npm run security:semgrep`, `npm run quality:knip`
- `npm run test:property`, `npm run test:sentry`, `npm run build:next`

## Boundaries

Work in the isolated task worktree. Preserve integrated changes and existing APIs,
sources, subscriptions and credentials. The coordinating chat owns main pushes
and deployment. Before release include current origin/main, repeat validation and
integration preflight; wait for the preceding release's confirmed Production SHA.

## Style composition

`TableSurface` and CRM overview sections remain importable in Node without a
stylesheet loader. Their owning page styles import the shared `Analytics.css`
contract; standalone analytics stories load it explicitly.

Interactive class bars include a full-width 48 px hit area per row. The plot
uses its actual container width on narrow screens so SVG scaling does not
shrink those targets below 44 px. Native mulligan sorting labels inherit
their table header ink to preserve contrast on the common light surface.

Matchup matrices preserve the dark sticky footer inside the native table
surface. Midrange winrate cells use a darker green so small labels retain
WCAG AA contrast, including the hover brightness state.

Translation workspaces use shrinkable grid columns inside the native table
surface. Mobile translation cards wrap long names and retain their own cell
padding so the shared table cannot widen the page.
