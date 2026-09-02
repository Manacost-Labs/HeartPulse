# HearthPulse SEO foundation

## Objective

Protect the canonical `hearthpulse.net` identity, make public search-preview
media crawlable, and preserve the cache policy selected by the application.
This slice must not open private API responses to indexing or shared caches.

## Commands and entry points

- `npm run test:unit -- --run tests/article-image-src.test.ts` verifies the
  public article-cover host boundary.
- `node --test tests/koloda-domain-links.test.mjs` verifies canonical brand and
  compatibility-domain references.
- `node --test tests/robots-policy.test.mjs tests/nginx-html-routing.test.mjs`
  verifies crawler policy at both the public file and origin edge.
- `node --test tests/hearthpulse-shadow-nginx.test.mjs` verifies the canonical
  edge cache contract.
- `make check` remains the repository-wide release gate.

## Project structure

- Browser and shared URL policy lives in `shared/articleImageSrc.ts` and the
  owning frontend route modules.
- Express owns media validation and response cache headers.
- `deploy/nginx/arena-seo-map.conf` classifies API responses for search robots.
- `deploy/nginx/arena-html-routing.conf` applies that classification at origin.
- `deploy/nginx/hearthpulse-shadow-app.conf` must forward origin cache headers
  unchanged while preventing its own proxy cache from storing application
  responses.
- `public/robots.txt` describes the same public crawler boundary.

## Code and configuration rules

- `hearthpulse.net` is the product identity. Bare `manacost.ru` is unrelated
  and must not appear in trust allowlists, initial source labels, or generated
  social artwork.
- Legacy `arena.hs-manacost.ru`, `cdn.arena.hs-manacost.ru`, and
  `hs-manacost.ru` remain migration transports; this slice does not remove
  them.
- Only the closed public media routes may omit `X-Robots-Tag: noindex`.
- Empty Nginx `add_header` map values intentionally suppress that header.
- The canonical edge bypasses its proxy cache but does not overwrite
  application `Cache-Control` with a global `no-store` response header.

## Testing strategy

1. Add failing contract assertions for each boundary.
2. Change the smallest owning implementation or Nginx map.
3. Run focused tests after every logical change.
4. Run TypeScript, build, security, Nginx, and full repository gates before
   integration.
5. Review the affected production URLs in a real browser after deployment.

## Safety boundaries and rollback

- Authentication, account, subscription, admin, and all unclassified API
  routes remain `noindex` and `no-store` where selected by the application.
- Public-media allowlisting is path based; clients cannot opt an arbitrary API
  response into indexing.
- A failure is rolled back by reverting the relevant commit. No database or
  content migration is part of this slice.

## Success criteria

- Bare `manacost.ru` is absent from HearthPulse trust and branding paths.
- `/api/article-cover`, `/api/card-image/`, and `/api/public-resource/` may be
  crawled on `hearthpulse.net`; other API routes retain `noindex`.
- Immutable/public origin responses remain immutable/public at the canonical
  edge, while private responses retain their origin-selected `no-store` policy.
- Focused contracts, `make check`, security checks, browser review, production
  SHA verification, and the production smoke all pass.

## Open questions for the next slice

- Measure whether article-cover originals should gain server-side responsive
  formats rather than relying only on browser sizing.
- Decide which legacy internal links can move from redirects to direct
  canonical URLs without affecting saved content.
- Use Search Console data to prioritize title and landing-page improvements.
