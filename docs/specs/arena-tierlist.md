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
