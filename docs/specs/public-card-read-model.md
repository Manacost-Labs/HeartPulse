# Public constructed-card read model

`server/modules/constructedCards` owns catalog membership validation, bounded
reading and the public card projection. Both the Express HTML renderer and
`GET /api/public/constructed-cards/:format/:cardId` use the same reader.

A unique, indexable catalog record establishes membership. A missing record in
a fresh authoritative catalog returns 404. Empty catalogs, ambiguous IDs, stale
absence, identity mismatches, upstream failures and deadline expiry return 503.
Existing records from the last known good catalog may still be served; the
public API answers a card already known in memory or in the stored catalog at
once, without waiting for the source ([after a restart](public-card-catalog-response-cache.md#public-card-after-a-restart)).
The reader does not hold a database transaction or cache credentials.

Warm anonymous membership remains available during bounded background
revalidation of its result cache; the collection is marked stale and keeps
its source timestamps. A stale missing identity still rejects rather than
returning 404. The [backend refresh contract](public-card-catalog-response-cache.md#backend-identity-refresh)
defines its grace interval, cooldown and invalidation behavior.

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

## Open detail in the server HTML

The card page also reads the anonymous card API
(`GET /api/constructed-cards/:cardId` with the default statistics context:
`format`, `statsFormat` = the page format, `period=1d`, `rank=legend`) through
`fetchPublicExpress` (no cookies, no Authorization) and adds its open part to
the seed (`apps/public-web/lib/publicCardDetail.ts`): formats, mechanics and
their translations, minion type, spell school, the wiki record (patch history,
related cards, generated pools, gallery, sounds, links), localized related
cards and the decks with the card. A deck keeps only its identity, archetype,
class and deck code (deck codes are open since 2026-11-18); winrate and score
are null. Only the wiki keys the page reads pass (with the picture variants:
`golden_cards`, `signature_cards`, `diamond_cards`, plus the variant images of
the record), so the variant tabs are in the HTML and the page does not jump.
The answer is dropped when it is another card or does not say
`statsAccess: false`. A detail over 192 KB
(a popular card: hundreds of decks or generated cards) keeps its mechanics and
history whole and the first 12 entries of every long list; it is dropped only
if it is still over 192 KB. The page waits 800 ms for it,
then renders the seed alone; Express still finishes and caches an abandoned
read for the next visit. So the server HTML shows the same mechanics, patch
history, related cards and decks a guest sees after the page loads, and never
says «История изменений не найдена» for a card that has a history.
A section without data (mechanics, patch history, gallery, sounds, links) is
not printed at all, and the statistics block lists name and value only: what
each number counts is told once in the folded «Что значат цифры» (owner's rule
2026-11-20: no filler or explanation sheet at the foot of a page).

Checks: `test:public-card-read-model`, `test:constructed-card-seo-routes`,
`test:constructed-card-urls`, `test:next-public-card-seed`, `test:next-pilot`,
`tests/next-card-detail-proxy.test.mjs` (open detail, paid sentinels),
Storybook public identity/profile states and browser QA.

## Catalog server seed

The Next catalog loader calls the existing list API without cookies or
Authorization, with `credentials: omit`, no shared fetch cache, a deadline and
redirects disabled. The constructed-cards URL model supplies the query.
Its explicit projection validates format, period/rank and bounded pagination,
then copies public card identities, facts, images, facets and translations.
Every card has `stats: null` and the envelope has `statsAccess: false`, even
if a malformed upstream response contains private fields. Empty search results
remain a valid page. Invalid payloads and upstream failures are retryable server
errors, never a successful empty catalog or a card 404.
