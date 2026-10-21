# Standard matchups

`/standard/matchups/` compares Standard and Wild archetypes at Legend rank.
The page offers an overview, a matrix, archetype and opponent filters, and
search. The Express `/api/standard/matchups?format=standard|wild` endpoint
provides rows, columns and win rates. The API requires the `standard`
subscription entitlement.

Anonymous HTML may contain a description and access gate, but no private
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
