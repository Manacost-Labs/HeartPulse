# Constructed card URL contract

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

Verification: `test:constructed-card-urls`, `test:public-url-policy`,
`test:constructed-card-seo-routes` and `test:production-monitor` cover ordinary
and Blizzard identities, metadata, sitemap locations and local HTTP crawling.
