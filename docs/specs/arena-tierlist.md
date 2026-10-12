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
