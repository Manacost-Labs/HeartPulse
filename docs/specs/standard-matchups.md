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
stale matrix only to the same account; a 401 or 403 clears that cache entry.
The React loader discards prior-account data immediately, isolates the two
formats in view state, and ignores responses from aborted or superseded loads.
The legacy page can now accept a controlled data source. In Next.js this
prevents its old format-only localStorage cache and mount-time fetch from
running; Vite retains the existing source until its route is retired.

The shared response type is owned by `src/modules/standardMatchups`. The
public Nginx owner remains legacy until the Next implementation passes
direct-port, browser and routing checks.
The staged Next route renders only a public description and access gate before
entitlement verification. Authorized clients use the controlled matchup view;
the legacy mount-time fetch and format-only cache stay disabled there.
