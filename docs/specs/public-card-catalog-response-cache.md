# Public card catalog response cache

The Next catalog loader owns a bounded process-local store of validated
anonymous catalog seeds and of the last good projection of each card. It
belongs to the Node process (`globalThis`, `lib/defaultCatalogStore.ts`), so
`proxy.ts` and the pages, which are bundled apart, see the same data. It is
discarded on process or release restart.

## Catalog seeds

- Key: format plus the normalized API request. The default list of each
  format, filtered, ranked, sorted and paged lists all have their own entry
  (at most 100; the oldest idle entry goes first, an entry with a read in
  flight is never dropped). A switch between table and gallery shares one
  entry, because the data request is identical.
- A successful read stays fresh for 30 seconds. No viewer cookies or paid
  statistics enter the store; Express requests keep their anonymous headers.
  Errors and invalid projections are never stored as data.
- Response deadline, 2 seconds (`CATALOG_READ_DEADLINE_MS`): a caller waits
  for Express that long. The read itself goes on for up to 10 seconds and
  warms the entry when it succeeds, so a slow but live Express costs one slow
  answer, not an outage. Callers arriving within the 2 seconds join the read
  in flight; one that has already missed its deadline is not joined again, so
  a recovered source is tried at once.
- On a failure or a missed deadline the last good version of that key is
  served for up to 6 hours. It is a new projection with `dataStatus: stale`
  and a `warning` (the same fields the Express route uses for its own LKG),
  so the page prints its existing data notice; the stored copy stays `fresh`.
  While such a copy exists, a failed source is left alone for 5 seconds
  before the next try. With no stored version, the read throws
  `CatalogUnavailableError` and every visit tries Express again.
- `proxy.ts` probes the same store for catalog documents
  (`/standard/cards/`, `/standard/cards/{standard,wild}/`, with their query).
  Without any version the answer is `503` with `Retry-After` and no
  `noindex`, as a page component cannot set a status. The probe is skipped for
  script fetches, told by `rsc: 1` or `Sec-Fetch-Dest: empty`, so a menu
  prefetch or client-side navigation gets the in-app error state instead of a
  503 in the console.

## Cards

`proxy.ts` reads the card projection for at most 2 seconds. The read goes on
(up to 10 seconds) and keeps the last good projection of up to 500 cards for 6
hours (`lib/cardLastGood.ts`, projections over 256 KiB are not kept). That
copy is independent of the 4 KiB request header that normally hands the
projection to the page; the page reads Express for 2 seconds and then the
same copy when the header could not carry it. A card seed holds only static
facts (name, text, stats `null`), so it has no freshness field to mark. With
no copy, the answer is a `503` with `Retry-After` and no `noindex`, in the
header and in the HTML. A `404` stays `noindex`.

## Edge

nginx adds no `X-Robots-Tag: noindex, nofollow` to a `503` on
`/standard/cards/*` (`$arena_next_cards_robots_header`), so a crawler comes
back after `Retry-After` instead of dropping the page. Other statuses and all
other Next routes keep their policy.

## Verification

- `tests/next-public-card-seed.test.ts`: overlapping reads, reuse, format
  separation, expiry, the last good copy through an outage, the stale
  projection (`stale` plus warning, stored copy `fresh`), the 2-second
  deadline, a late answer warming the entry, backoff, the 6-hour limit.
- `tests/next-card-detail-proxy.test.mjs`: a stalled or slow Express against
  the real Next server: last good card and catalog within 2 seconds, 503
  without noindex and without a last good version, filtered and paged
  addresses, a card over the header limit.
- `tests/nginx-html-routing.test.mjs`: real nginx, 503 of the card pages
  without noindex, the deck builder unchanged.
- Existing Next pilot checks cover guest SSR, filters, empty results and
  retryable failures; the browser suites cover navigation and prefetch.

Documentation impact: this spec, `apps/public-web/README.md`,
`deploy/nginx/README.md` and `changelog.d/`.

The backend's anonymous catalog reader now skips statistics retrieval and
history recording. Entitled browser requests retain the full statistics reader
and its separate cache. The anonymous `updatedAt` describes catalog publication;
period/rank descriptors remain available. This removes an unrelated source
from the SSR critical path.

## Backend identity refresh

The backend's warm anonymous result can be returned while one source refresh
runs. The grace interval after result expiry is three result TTLs, capped at
15 minutes: with the default five-minute TTL, refresh can use the warm result
for up to another 15 minutes. This is a bound on waiting for revalidation, not
a new limit on the validated source store's existing LKG policy.

The returned result keeps its original publication and verification times and
is explicitly `dataStatus: stale`, `cacheSource: LKG`. A refresh failure starts
a 30-second cooldown without moving the old expiry. Past the grace interval,
the reader fails rather than extending that copy. A successful source read
replaces membership; invalidation generations reject late writes and cooldowns.
Only anonymous results use this path: paid statistics retain their awaited,
isolated read and history behavior. Missing identities in stale data still
reject rather than becoming an authoritative 404.

A source refresh reads every catalog page. A page that fails with a transport
error, a timeout, invalid JSON, HTTP 429 or HTTP 5xx is requested once more
before the refresh is abandoned. During Kolodahs sync jobs, single uncached
pages take 5–8 seconds and sometimes cross the 8-second request limit. Without
the retry, one slow page would show the stale-library banner over a catalog
that was verified minutes earlier. HTTP 4xx pages are not retried. A page that
fails twice still produces the `stale`/`LKG` result above. The failure reason
is logged as `[constructed-cards] <format> catalog refresh failed`.

The Next seed keeps its own 30-second freshness and validation. When Express
itself cannot be read, Next serves its stored copy marked stale (see above);
a backend LKG result arrives through a new validated read with truthful source
metadata.

## Express read deadlines

Enriched card details (wiki, related cards, decks) are kept for six hours
(`detailCacheTtlMs`) in a bounded map: at most 2 000 entries
(`detailCacheMaxEntries`, `server/modules/constructedCards/boundedCache.ts`),
the least recently read go first. Since the Next card
page reads the anonymous detail for its server HTML (`publicCardDetail.ts`), one
crawl of the catalog touches every card; unbounded, that held ~1.4 GB
(2026-11-20).

Incident 2026-11-15: one source read that never settled stayed in the shared
load map, so every later catalog, card and card-sitemap request waited on it.
Each shared (deduplicated) load now has two deadlines:

- Response deadline, 2 s (`responseDeadlineMs`). A caller waits that long,
  then gets the last good version: the previous result, else the stored
  catalog without statistics (`dataStatus: stale`, `cacheSource: LKG`). With
  no stored version the answer is a fast 503 with `Retry-After`. The same
  holds for card details (known card, empty wiki and decks) and for
  `/sitemaps/*-cards.xml` (`responseDeadlineMs` of the sitemap router).
- Load deadline, 15 s (`loadDeadlineMs`; 25 s for a sitemap rebuild). Past it
  the load is dropped from deduplication, so the next request starts a fresh
  read and picks up recovered data.

After a failed or late refresh the last good catalog, and every collection
built on it (`dataStatus: stale`), is kept for 30 s instead of the five-minute
fresh window (#396): a cold start after a deploy often misses the 15 s load
deadline, and with the long window guests saw «Показывается последняя
сохранённая версия библиотеки карт» for five minutes after every deploy.

Every missed deadline writes one `[deadline] <name> did not finish within N ms`
line naming the load (`constructed-cards:catalog:standard`, `…:patches`,
`…:decks`, `entity-sitemap:standard-cards`, and so on).

### Public card after a restart

Incident 2026-11-20 (#630): after every restart of `hs-arena` the source
catalog load missed its 15 s deadline, and
`GET /api/public/constructed-cards/:format/:cardId` waited the full 2 s
response deadline before it fell back to the stored catalog. Next stops
waiting after the same 2 s (`CATALOG_READ_DEADLINE_MS`), and its own last good
copy is lost on restart, so card pages answered 503 for minutes.

The public card read now looks at catalog identity already in memory or in
the stored catalog first (`peekPublicCards`, no source read). A unique,
indexable card found there is answered at once (marked stale when it comes
from the stored copy) while the shared load refreshes in the background.
Absence is still decided by the shared load: a missing card waits up to 2 s
for a fresh catalog (a real 404) and otherwise gets 503 with
`Retry-After: 30`, never a 404 from a stored copy.

The stored catalog is tens of megabytes (Wild) and is read synchronously, so
it is read at most once per format and invalidation generation every 30 s,
not once per waiting request. The first card of each format after a restart
pays that one read; later requests answer in milliseconds. Parsed, the copy
holds about 90 MB of heap for Wild and 20 MB for Standard, so it is released
after those 30 s or as soon as a load puts a catalog for the format in memory.
Check: `tests/constructed-card-deadline-cases.ts` (restart with a stored
catalog while the source hangs or fails).
