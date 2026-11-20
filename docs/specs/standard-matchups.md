# Standard matchups

`/standard/matchups/` compares Standard and Wild archetypes at Legend rank.
The page offers an overview, a matrix, archetype and opponent filters, and
search. The Express `/api/standard/matchups?format=standard|wild` endpoint
provides rows, columns and win rates. The API requires the `standard`
subscription entitlement.

## Open general slice (E21 OL5)

A guest sees the general slice in the server HTML: all ranks (`rank=all`), the
source's default period and the page's default floor of 25 games per pair. The
rows and columns are the most played archetypes (20 in the HTML, the rest of
the slice loads in the browser from the same open route), with slug, name,
class, popularity and games, the win rate and games of every pair, the date of
the data and the source. Ranks other than `all`, the period list, the floor
menu and the history of a pair are paid and not in the HTML, the RSC payload or
the JSON-LD.

- `GET /api/standard/matchups/public?format=standard|wild` has no guard and
  reads no filter from the query. It projects the dataset field by field
  (`server/standardMatchupPublicSlice.ts`), keeps its own cache (5 minutes) and
  ETag per format, and shares one origin read between concurrent misses. A
  failure answers the stale copy (`warning: 'stale'`), then the last good copy
  kept apart in Redis (`:public-v1`, `warning: 'fallback'`), then `503` with
  `Retry-After: 60`, never `502`.
- `GET /api/standard/matchups` stays behind `requireStandardAccess`.
- The Next page (`apps/public-web/lib/publicStandardMatchups.ts`) reads only the
  public route anonymously and re-checks the answer
  (`src/modules/standardMatchups/model/publicProjection.ts`); an answer that is
  not the `all` rank of the format is refused. Without a snapshot a regeneration
  throws, so ISR keeps the last good page; only the build, which has no API,
  prints the «temporarily unavailable» state.
- The page is the subscriber's component (`src/features/StandardMatchups.tsx`:
  banner, formats, sections, matrix, overview, leaders) on the open slice, for
  a guest, a robot and a signed-in reader without a subscription; the server
  renders it from the same projection
  (`openStandardMatchupsData` turns it into the subscriber's model). Rank,
  period and the games floor stand in their places as locks
  (`StandardMatchupsFilterLocks` on the shared `PaidLocks`,
  `.paywalled-standard-matchups`, named by the JSON-LD `hasPart`); a
  press opens the subscription offer (`PaidOfferProvider`). While a
  signed-in reader's access is checked the locks are neutral and inert. A subscriber's slice replaces the open data
  inside the same component, with no remount; if it does not arrive, the open
  data stays with the message and «Повторить». Until the browser has run the
  content is `inert`, so the server markup has no dead control. Wild is read
  from the open route in the browser after the format switch; the server HTML
  is Standard. The subscriber's component has no history of a pair, so there
  is no lock for it.
- `tests/standard-matchups-public.test.ts` puts a label in every paid field
  (the Legend rank `63.3636`, the period list, history) and checks that none
  reaches a guest, with a mutation that turns it red;
  `tests/next-standard-matchups-open-layer.test.mjs` does the same for the HTML,
  the RSC payload and the JSON-LD of the built page.

Anonymous HTML may contain a description and the open slice above, but no private
matrix values. A Next.js client must wait for a verified account and
entitlement before requesting the API. Cached matrices must be scoped to an
account and format, cleared after access denial, and hidden immediately when
the account or entitlement changes. The current Vite route has a six-hour
format-scoped browser cache; migration must not expose that cache across users.

The new browser client validates format, rank, columns and rows before caching.
It uses a six-hour account-and-format key, ETag refresh and an unconditional
retry for a 304 response without a usable cache. A transient error may show a
stale matrix only to the same account; a 401 or 403 clears that cache entry
and the matrix already displayed in the browser.
The React loader discards prior-account data immediately, isolates the two
formats in view state, and ignores responses from aborted or superseded loads.
The legacy page can now accept a controlled data source. In Next.js this
prevents its old format-only localStorage cache and mount-time fetch from
running; Vite retains the existing source until its route is retired.

The shared response type is owned by `src/modules/standardMatchups`. The
public Nginx owner is Next.js after direct-port, browser and routing checks.
The Next route renders only a public description and access gate before
entitlement or administrator verification. Authorized clients use the
controlled matchup view;
the legacy mount-time fetch and format-only cache stay disabled there.
Verified administrators can use the protected matrix without a Standard
entitlement, matching the Express API authorization rule.

## Matrix presentation

`src/features/StandardMatchupMatrix.tsx` is the default view of the page,
loaded on demand while the matrix data loads: the vendored VaryloUI
`gaming/MatchupMatrix`, restyled to the parchment through `--ui-*` tokens in
its own scope. Rows and columns are the
API's archetypes in source order, with the Russian label and the class icon
from `classKey`. A pair without a win rate is below HSGuru's
`min_matchup_sample` (read from `sourceUrl`) and stays empty; mirrors are even
by definition.

HSGuru publishes no game count per pair, only each archetype's share of games
(`popularity`). The pair's expected sample grows with the product of both
shares, so `model/matrix.ts` ranks a pair by the geometric mean of the two
shares: below 2% is low, below 4% medium, else high. The tooltip shows the
win rate, "от N игр" (the source minimum, not a count) and that rank; low
pairs are muted and left out of the best/worst summary. "Против меты" is the
win rate against the field computed from the matchups weighted by popularity,
so it can differ slightly from HSGuru's overall win rate of the row.

On wide screens the grid spans the frame: cells keep the kit's 46px minimum
and share the spare width, the names column takes only what its names need
(up to 16rem). The tooltip is 300–420px wide and wraps two long names instead
of running past its edge. Below 600px of container width the kit's list view
replaces the grid.

The API adds `classKey` (inferred from the English name by
`server/standardMetaClasses.ts`, or `null`) to columns and rows. The client
accepts only known class keys; responses cached before the field existed still
parse and fall back to initials. Column `popularity` reads the HSGuru popularity
row at `index - 2`: that row has no cells for the win-rate and name columns.

## Archetype overview

The "Обзор архетипа" view (`StandardMatchupsOverview`, model
`model/overview.ts`) shows one archetype against the field:

- a header with the class icon over the class art (`archetypeClassBackdrop`,
  as on the archetype page), the win rate against the field and share of games
  as HSGuru publishes them, the count of favoured, even and unfavoured pairs and
  a link to the archetype page (slug derived from the English name with the
  server's `constructedArchetypeSlug` rule). The archetype is picked in a
  VaryloUI combobox with search and class icons, grouped by class, or with
  chips for the six archetypes with the largest share;
- a one-line summary: the best and worst pair (low-confidence pairs are left out
  while trusted ones remain; no worst when it ties the best) and the best and
  worst opponent class, then a strip with the average win rate against each
  class, weighted by its archetypes' shares;
- every published pair in one list, sorted by win rate and split by the
  headers Хорошие (52%+), Ровные (48–52%) and Сложные (below 48%). A row has
  the class icon, the name linking to the opponent's archetype page, its share
  of games and reliability, a bar from 50% (green right, red left, clipped at
  ±25 points) and the win rate. Search and the group chips filter it. With
  more than 15 pairs the list shows the five best favoured, five even and five
  worst unfavoured pairs until "Показать все"; nothing scrolls inside it.

HSGuru publishes no game count per pair or per archetype in the matchup table,
so the view shows no games and no confidence interval: reliability is the
share-based rank above, and low pairs are muted. Below 640px a row is a
compact card (name and rate on top, the bar below).

"Сильнейшие архетипы" under the view replaces the former "Лучшие архетипы" and
"Быстрые ориентиры": the six archetypes with the best win rate against the
field, each with its share, a bar and its best and worst pair; a card opens
that archetype's overview.
