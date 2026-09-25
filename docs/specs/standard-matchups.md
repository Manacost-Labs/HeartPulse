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

The shared response type is owned by `src/modules/standardMatchups`. The
public Nginx owner remains legacy until the Next implementation passes
direct-port, browser and routing checks.
