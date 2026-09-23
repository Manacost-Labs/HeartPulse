# Public constructed-card read model

`server/modules/constructedCards` owns catalog membership validation, bounded
reading and the public card projection. Both the Express HTML renderer and
`GET /api/public/constructed-cards/:format/:cardId` use the same reader.

A unique, indexable catalog record establishes membership. A missing record in
a fresh authoritative catalog returns 404. Empty catalogs, ambiguous IDs, stale
absence, identity mismatches, upstream failures and deadline expiry return 503.
Existing records from the last known good catalog may still be served. The
reader does not hold a database transaction or cache credentials.

The public API emits only the explicit projection: identity, names, rules,
flavor, localized public facts and image, plus validated class code and DBF.
It never serializes the source record, statistics, decks, subscriptions or
account data. Cookies and Authorization do not expand this projection.
Responses use `Cache-Control: no-store`; unavailable responses include
`Retry-After: 30`. Paid statistics remain in the existing Express endpoint,
which independently checks the current account and subscription.

The browser module owns card URL parsing and the reusable identity component.
The Vite route remains the composition adapter for its existing controls,
formatting, media and entitlement UI. This preserves appearance while the
public server-loading boundary can move to Next.js independently.

Next card details use this projection for server HTML and an explicit public
hydration seed. The adapter rejects mismatched identities or missing names and
copies only public fields; statistics are always null in that seed. Browser
hydration reads account/subscription state and interactive statistics from the
existing same-origin APIs. Query filters are seeded from the initial request so
server and browser markup agree. SSR errors are retryable; a provider failure
must never be misreported as a missing card.

Checks: `test:public-card-read-model`, `test:constructed-card-seo-routes`,
`test:constructed-card-urls`, `test:next-public-card-seed`, `test:next-pilot`,
Storybook public identity/profile states and browser QA.
