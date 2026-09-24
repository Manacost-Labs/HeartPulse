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

The shared TypeScript contract is exported from
`src/modules/arenaTierList/public.ts`. The legacy route still owns data loading
and rendering while the Next.js route is being built. Public Nginx ownership
must remain on legacy until the Next route passes direct-port and browser checks.
