# Constructed card URL contract

## Catalog state

The constructed-cards module owns parsing and serialization of catalog query
state: search, class/set/mana/attack/health/mechanic/type/rarity filters, sort,
direction, period/rank, page, page size and gallery/table view. The path owns
Standard/Wild format. Invalid controls use existing defaults; text filters are
bounded to the API's 120-character limit and page size is 60 or 120.
Serialization preserves unrelated campaign parameters and removes cleared or
default controls. Server rendering and browser history use this same model.
Discrete control changes create history entries; typing replaces the current
entry and debounces network reads. Card links and return navigation carry the
catalog query, including page and view. Modified clicks retain native link
behavior. Existing canonical and query-index policies also apply in Next.

## Card identity

Constructed card identity is either an ASCII game ID (`[A-Za-z0-9_]{2,80}`)
or `blizzard:<dbf>`, where DBF starts with a nonzero digit and has at most
19 digits. Standard and Wild retain their existing URL namespaces.

`src/modules/constructedCards/public.ts` owns browser link generation and route
parsing. Identity is decoded exactly once and validated independently of query
parameters and fragments. Malformed escapes, encoded separators and double
encoding do not resolve as a card.

Generated links encode the identity with `encodeURIComponent`. Canonical URLs
and sitemap locations add a trailing slash. Thus the canonical Blizzard form
is `/standard/cards/standard/blizzard%3A12345/`. Bare colon and lowercase `%3a`
inputs resolve to the same identity and advertise this canonical form.

Express SEO rendering, browser metadata, both card sitemaps and the production
monitor follow this contract. Monitoring validates canonical encoded paths,
but compares decoded identities with JSON-LD identifiers. It never compares an
encoded URL segment directly with a card ID.

The Next pilot uses the same parser in its request proxy. It overwrites internal
identity headers before metadata and page rendering; incoming headers are never
trusted. Missing trailing slashes redirect with HTTP 308 and preserve the query.
Only authoritative missing cards return 404; upstream failure is a retryable
error. The optional routing flag transfers catalog lists and details together
to Next.
Sitemaps and all APIs retain Express ownership.

Nginx uses its once-decoded URI to recognize Blizzard IDs, then emits `%3A` in
the canonical redirect. Invalid card segments retain their original encoding
through host/scheme redirects; `%253A` must not become `%3A` and resolve to a
different identity. Detail locations forward valid IDs to the authoritative
Express resolver with status and cache headers preserved.

Verification: `test:constructed-card-urls`, `test:public-url-policy`,
`test:constructed-card-seo-routes`, `test:next-pilot` and
`test:production-monitor` cover ordinary
and Blizzard identities, metadata, sitemap locations and local HTTP crawling.
`test:nginx-routing` and `test:nginx-canonical-hosts` exercise temporary Nginx
instances for alias redirects, query preservation, upstream forwarding and
double-encoding rejection.
