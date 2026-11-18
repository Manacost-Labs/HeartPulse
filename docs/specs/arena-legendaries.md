# Arena legendary groups

`/legendaries/` shows groups of first-pick legendary cards for Arena. Each
group has a key legendary, optional companion cards, overall metrics and
optional class-specific metrics. The class filter includes neutral groups.
Users can switch between HSReplay and Firestone, sort the groups, and search
card names.

## Open and paid layers (E21 OL1)

The page is **open**: a guest, a robot and a subscriber get the same server
HTML with the real groups. Only two figures are paid.

<!-- markdownlint-disable MD013 -->
| Layer | Fields | Source |
| --- | --- | --- |
| Open | key card and companions (`cardId`, name, cost, type, rarity, class, copies, images), group class, `winRate`, `pickRate`, `totalGames` (sample, when the source has it), per-class `{ winRate, pickRate }`, source label, `updatedAt` | `GET /api/legendaries/public` |
| Paid | `offerRate` («Частота предложения») and `score` («Оценка ArenaSmith»), overall and per class, and sorting by them | `GET /api/legendaries` (Arena entitlement) |
<!-- markdownlint-enable MD013 -->

- The public endpoint is an allowlist projection (contract below). Its
  top-level `paidMetrics: { offerRate, score }` only says
  whether the source has the figure at all; it carries no value. Groups come
  sorted by `winRate` descending, then `cardId`, so the order does not reveal
  the paid ranking.
- The Next page (`apps/public-web/app/legendaries/page.tsx`, ISR 300 s) reads
  `/api/legendaries/public?source=hsreplay` anonymously through
  `lib/publicLegendaries.ts` and passes the result to the client page.
  `parsePublicLegendaries` (`src/modules/arenaLegendaries/model/publicProjection.ts`)
  copies it field by field, so a paid figure that arrived by mistake never
  reaches the HTML, the RSC payload (`self.__next_f`) or the JSON-LD.
- No snapshot (Express 503 or failure): the page is a 200 and says
  «Данные временно недоступны», never «0 групп»; the browser asks again.
  `warning: 'stale' | 'fallback'` shows the last snapshot with its date.
- Firestone and a source switch are read by the browser from the public
  endpoint; a snapshot the server marked stale is re-read once.

## Paid figures

- The paid columns exist in the markup for everyone, inside
  `.paywalled-legendaries` cells: name and meaning for all, the value only for a
  subscriber. A guest gets a button with a lock; its tap, or choosing a paid
  sort, opens the subscription offer («Узнать, как часто эту группу предлагают
  вашему классу»). The class and the group stay in the address
  (`?class=<class>&group=<cardId>`); a link with them scrolls to the group and
  marks it. The offer closes when access is confirmed.
- With `paidMetrics.<metric> === false` the cell says «Нет данных» for everyone.
- A viewer with the Arena entitlement (or an administrator) also loads the
  protected `/api/legendaries`; `mergeLegendaryPaid` lays `offerRate`, `score`
  and the per-class pair over the open groups by key card. Order, names and
  winrate stay the open layer's, so the paid values arrive without moving the
  grid; the class, the search and the scroll position are kept.
- Paid values are never sent to a guest in HTML, RSC or JSON-LD. The JSON-LD of
  the page is a `Dataset` with `isAccessibleForFree: false` and
  `hasPart` (a `WebPageElement` with `isAccessibleForFree: false` and
  `cssSelector: '.paywalled-legendaries'`).

## Client contract

The shared TypeScript contract is owned by `src/modules/arenaLegendaries`.
Its browser client validates protected responses, scopes its six-hour cache by
account and source, refreshes with ETags, clears the cache after an access
denial, and shows a stale snapshot only for the same account during a transient
failure. A 304 response without a usable cache triggers an unconditional retry.
An access denial also removes an already displayed snapshot immediately.
The React loader keeps the previous source visible during a source switch,
ignores aborted responses, and drops the prior account's paid figures
immediately when account identity or Arena entitlement changes (the open groups
stay). Data from one account must never remain visible after an account change.

The production HTML route is served by Next.js. Phone layout: the name, the
companions and the winrate of a group come before the paid cells.

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
