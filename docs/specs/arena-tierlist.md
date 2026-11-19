# Arena tier-list data contract

The Arena tier list accepts `hsreplay`, `heartharena` and `firestone` as source
choices. The protected Express endpoint is `GET /api/tierlist`; it resolves the
source, checks access before loading data, and supports a cache bypass through
`t` or `bust=1`. Clients must not render subscriber card statistics into
anonymous server HTML.

The response contains class sections with ordered tiers and card IDs, a card
lookup for images and statistics, an update timestamp and source. It may include
`warning` for stale or fallback data and `provisional` with coverage fields for
an early sample. Client views must keep the selected source, loading state,
stale warning and retry behavior distinct while switching sources.

The shared TypeScript contract and subscriber client are exported from
`src/modules/arenaTierList/public.ts`. The client validates responses before
caching them, keeps caches separate by account and source, honors ETags, clears
protected data after a 401/403, and marks network fallback as stale. The React
view also drops an already displayed snapshot after a 401/403. Only a transient
non-authorization error may retain the same account's stale data. The Next route
reuses the legacy presentation with the new account-gated hook. Public Nginx
serves the Next route after production direct-port and browser checks.

The request uses short source IDs (`hsreplay`, `heartharena`, `firestone`), while
the protected response identifies its provider as `hsreplay.net`,
`heartharena.com`, or `firestoneapp.com`. Validation accepts the matching
provider label and the older short ID in account-scoped browser caches; a
label from another provider is rejected.
HSReplay cards without an ArenaSmith score carry `score: null`; they remain in
the list, while non-finite and non-numeric scores are rejected.

The new React hook keeps the previous source visible while another source
loads, drops data immediately when the account or entitlement changes, and
ignores responses from requests aborted by navigation or a newer selection.
When HearthArena or Firestone is selected, the client fetches the protected
legendary groups and hides companion cards; group key cards are never treated
as companions, even when they appear in another group's card list.

The legacy browser cache key is `tl_ru_cards_v3_<source>`; the new subscriber
client uses `arena-tierlist:v4:<account>:<source>`. Both have a 60-second fresh
TTL.
The API URL includes `v=ru_cards_v3`; an explicit refresh adds `t=<timestamp>`
to bypass the server cache while preserving the selected source.
Verified administrators can request the protected API without an Arena
entitlement, matching the server authorization rule.

## Compact presentation

The page does not show the snapshot timestamp. Source selection and fallback
warnings remain visible. The module owns the controls and letter shield badges;
legacy route composition supplies state and filtered results.

Class icons keep their accessible names and selected state. Search, labelled
rarity and mana selectors, and an explicit reset replace the dense filter rows.
The reset clears search, rarity and mana while keeping the selected class.
Mana `10+` continues to include all costs of ten and above. HSReplay keeps the
gallery/table switch; other sources show the gallery. Tier headings contain
only a letter badge and a short name, with no card count or advice paragraph.
Badges use a bronze-rimmed shield with a coloured centre and a readable letter.
The same design has a compact size for tables and the card modal; CSS draws the
shape without image requests. Each badge exposes its tier as an accessible image.
The selected-class heading also omits the card count. Mana and rarity selectors
show the existing game icons used by the standard card library. The rarity icon
follows the selected rarity; the unfiltered state uses the common gem.

Verification: `npm run lint`, `npm run test:arena-tierlist-client`,
`npm run test:tierlist`, `npm run test:storybook`, `npm run build-storybook`,
and browser checks of filter/reset interactions at desktop and phone widths.
New UI is exported through the module public entry and uses existing React/CSS
conventions. No API, access or provider contract changes.

## Source switching and card loading

The hook keeps one client per account and entitlement state. A validated,
60-second snapshot stays in memory per source, so revisiting it avoids
synchronous storage parsing. Every selection still revalidates access and data
with the protected API. A 304 preserves the data object and updates its memory
expiry without rewriting the full storage payload. Storage expiry remains
bounded by its last full response. Denial clears the selected source cache;
aborted requests cannot populate it. A failed new source cannot retain a
previous provider's snapshot as its own stale result. Source buttons stay
usable during requests, and newer selections cancel older requests.

The desktop gallery and table start with 48 cards and add 48 through Show more;
phones
start with 36 cards on the first render and retain 36-card pages. The initial
limit follows the viewport immediately, without a temporary desktop-sized page.
The first six cards load eagerly, with later cards lazy.
Hero cards use complete HearthArena or HearthstoneJSON card renders in gallery
and modal views: Blizzard's portrait image omits the playable card frame and
text (verified with CATA_190h, Deathwing, Worldbreaker). The card ID and scores
remain untouched. Filters use the existing main-page wooden border asset,
aligned native selectors, and an explicit selected appearance for mana/rarity.

React request cleanup follows the [official effect cleanup pattern](https://react.dev/reference/react/useEffect#fetching-data-with-effects).

The Deathwing Storybook case uses a local fixture at
`src/features/fixtures/deathwing-card.webp`, captured from the
[original HearthArena render](https://cdn.heartharena.com/images/renders/ruRU/CATA_190h.webp).
It stays in the development story bundle and requires no live image API.

## Open layer for guests and robots

`GET /api/tierlist` stays closed (entitlement `arena`). The page `/tierlist/`
shows guests and robots, in server HTML, the whole card pool of the current
Arena by class with tier, base winrate and pick rate, the update date, the
source and a lower bound of the sample ("по данным более N игр"). Owner
decisions 2026-11-18: the open layer grew from the top ten to the whole pool,
and the pick rate of cards is open as well. It comes from a separate anonymous
projection, `GET /api/tierlist/public?source=hsreplay|firestone`
(`server/tierlistRoutes.ts`, `server/tierlistPublicProjection.ts`), built on the
same data and last-known-good fallback as the full endpoint.

- Sources: `hsreplay` (default) and `firestone`. Anything else (HearthArena
  included) is a 400. `t` and `bust` are ignored: a guest cannot fan out origin
  reads. The projection has its own cache (five minutes) and ETag per source.
- **Open, per card:** `cardId`, `name`, `classKey`, `className`, `tier`
  (`S`..`F`, `U` for a card without a tier), `cost`, `rarity`, `type`, `image`
  (our own `/api/card-image/` address), `winrate` and `pickRate` (percent
  rounded to 0.1). Top level: `updatedAt`, `source`, `sourceId`,
  `sampleGamesAtLeast`, `warning` (`stale` or `fallback`).
- **Paid (never sent):** `playedWinrate`, `inDecks`, `totalGames` (exact),
  `offerRate`, `discardRate`, `drawnWinrate`, `mulliganWinrate`, `keptRate`,
  `avgCopies`, `arenaSmithTier`, `arenaSmithTierPosition`, `arenaSmithRank`,
  `arenaScore`, `score`, a winrate more precise than 0.1, sorting and filtering
  by these figures, history.
- `sampleGamesAtLeast` is a lower bound: the largest per-card game count rounded
  down to two significant digits (987654 becomes 980000), or `null` when the
  source gives none or it is under 1000. Rounding is done in Express; the Next
  loader drops any other value.
- Failure order: fresh projection, origin, stale projection (`warning: stale`),
  last known good file (`warning: fallback`), then 503 with `Retry-After: 60`.
  The page then renders without the list (still HTTP 200).
- The page renders the `hsreplay` projection as one table per class (anchors
  `#tierlist-<classKey>`), the cards grouped by tier under the painted tier mark
  (`TierBadge`, one image per tier group, not per card). The class filter is a
  client enhancement over the same server markup (without a script every
  section is visible and the links are plain anchors); a choice is written to
  the address as `?class=<classKey>` and read back on load. The server HTML of
  the list stays well under 300 KB: rows carry text only.
- The open list is the page's content for everyone (#410), not a block below a
  gate: the banner and breadcrumbs, a line with the date, sample and source, the
  class chips and the tables. The server HTML does not branch on cookies or
  user agent. A browser that has no access never loads the full view: it is a
  separate chunk, fetched only for a subscriber (or when the server had no
  list, then the old subscription gate shows).
- **Locks in the data.** The closed values are shown as locks, never as values:
  the last column of every class table («Ещё», a hatched column behind a lock
  button) and two filter chips, «Мана» and «Редкость». A tap opens the
  subscription offer (`ArenaPaidOffer`, loaded on that tap); a guest who signs
  in comes back to the same address, class included, and the full view opens on
  that class. The lock buttons, the closed column and the closed chips carry
  `.paywalled-tierlist`.
- **A subscriber** gets the full interactive view in the open list's place. The
  swap happens only when the full view's code and the protected data have both
  arrived; until then the open list stays, so a subscriber never sees a gate or
  a skeleton first and the page does not shift (CLS under 0.01 is checked by
  `tests/next-arena-open-first-screen-browser.test.mjs`).
- Table columns at 360 px: the card takes what is left, «Винрейт, %» 5.25 rem,
  «Выбор, %» 4.5 rem, the lock 3 rem; no header overflows and no table scrolls
  sideways (#462).
- `/tierlist/` is a five-minute ISR page. The copy made at build time has no
  list (the build has no Express); after a deploy it is replaced on the first
  regeneration, and the post-deploy warm-up waits for the marker
  `tierlist-public-pool`.
- The paid view sits in `.paywalled-tierlist`, the container named by the
  page's JSON-LD (`isAccessibleForFree: false`, `hasPart`): the full view for a
  subscriber, the locks for a guest.

The rules shared by all open slices are in
[SEO foundation](seo-foundation.md#открытый-слой-и-платная-разметка).
