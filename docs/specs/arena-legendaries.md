# Arena legendary groups

`/legendaries/` shows groups of first-pick legendary cards for Arena. Each
group has a key legendary, optional companion cards, overall metrics and
optional class-specific metrics. The class filter includes neutral groups.
Users can switch between HSReplay and Firestone, sort the groups, and search
card names. The Express `/api/legendaries` response remains the data source.

The page requires the Arena subscription entitlement. Anonymous HTML may
contain its description and access gate, but must not contain private group
statistics. Client requests must wait for a verified account and entitlement;
data from one account must never remain visible after an account change.

The shared TypeScript contract is owned by `src/modules/arenaLegendaries`.
Its browser client validates protected responses, scopes its six-hour cache by
account and source, refreshes with ETags, clears the cache after an access
denial, and shows a stale snapshot only for the same account during a transient
failure. A 304 response without a usable cache triggers an unconditional retry.
An access denial also removes an already displayed snapshot immediately.
The React loader keeps the previous source visible during a source switch,
ignores aborted responses, and drops the prior account's data immediately when
account identity or Arena entitlement changes.
The production HTML route is served by Next.js after direct-port, browser and
Nginx cutover checks pass. The Next route serves the public description and
access gate in its initial HTML. Only a client with a verified Arena entitlement
or administrator access requests groups, matching the server authorization
rule.

## Open API: `GET /api/legendaries/public`

The open layer (E21, #437) serves real legendary groups to guests and robots
without any cookie. The protected `/api/legendaries` is unchanged and keeps
the full data for subscribers and existing clients.

The body is built by `server/legendaryPublicProjection.ts` field by field
(an allowlist, never a spread of the source row), so a field added to the
source later stays closed until it is listed on purpose.

- Top level: `updatedAt`, `source` (label), `sourceId` (`hsreplay` or
  `firestone`), `warning` (`stale` or `fallback`, only when it applies),
  `paidMetrics: { offerRate: boolean, score: boolean }` and `groups`.
  `paidMetrics` only says whether the source has the metric; it carries no
  value.
- Group: `classKey`, `winRate`, `pickRate`, `totalGames` (present only when the
  group row itself has a sample size), `keyCard`, `cards`, and for HSReplay
  `byClass[<class>]` with only `{ winRate, pickRate }`.
- Card (`keyCard` and each of `cards`): `cardId`, `name`, `cost`, `type`,
  `rarity`, `classKey`, `count`, `imageRu`, `imageHa`.
- Never sent on any level: `offerRate`, `score`, `arenaScore` and every field
  mixed in from the tier list (`winrate`, `deckWinrate`, card `totalGames` and
  `pickRate`, `playedWinrate`, `inDecks`, `discardRate`, `drawnWinrate`,
  `mulliganWinrate`, `keptRate`, `avgCopies`, `arenaSmithTier*`, `tier`,
  `statsContext`).
- Order: `winRate` descending, ties by key card `cardId`. It does not depend on
  paid metrics, so the order cannot reveal the paid ranking.
- Cache: own key `legendaries-public:<source>` (five minutes) and an ETag that
  is the hash of the projection, never the protected ETag; `If-None-Match`
  answers 304. `Cache-Control: public, max-age=300, stale-while-revalidate=600`.
  `t` and `bust` are ignored: a guest never forces an origin fetch.
- Failure order: previous projection from memory with `warning: 'stale'`, then
  the projection of `legendaries.json` (HSReplay only) with
  `warning: 'fallback'`, then `503 { error }` with `Retry-After`. An empty
  `groups` list is never sent with 200.
