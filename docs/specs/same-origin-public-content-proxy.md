# Same-origin delivery for public content

## Objective

Required images, audio, video, and public JSON used to render
`hearthpulse.net` must be requested by the browser from
`hearthpulse.net`. Upstream services may still be contacted by the HearthPulse
origin on a cache miss.

External navigation links and optional analytics are outside this contract.

## Delivery contract

- Browser-facing upstream resources use
  `/api/public-resource/:source/*`.
- `:source` is a closed server-side mapping. Clients cannot choose an
  arbitrary origin.
- Every source has an HTTPS origin and allowed path prefixes.
- Redirects are accepted only when the final URL still belongs to the same
  configured source.
- Only images, audio, video, and public JSON are returned.
- Credentials, cookies, authorization headers, and arbitrary request headers
  are never forwarded.
- Range requests are forwarded for media playback.
- Responses use `nosniff`, a same-origin resource policy, bounded streaming,
  and public stale-while-revalidate caching.
- Arena edge nodes cache successful responses from the public-resource route.
- Search crawlers may fetch `/api/public-resource/`, `/api/card-image/`, and
  `/api/article-cover`; every other API route remains blocked in `robots.txt`
  and receives `X-Robots-Tag: noindex, nofollow` at origin.
- External runtime libraries are bundled with the application instead of
  being loaded from a third-party CDN.

## Article covers

Editorial covers use `/api/article-cover?url=<source>[&w=<width>]`
(`server/articleCoverRoutes.ts`).

- `url` must be on the article host allowlist; redirects must stay on it.
  Only images are relayed, never SVG, and never more than the byte limit.
- Without `w` the original bytes and content type are relayed.
- `w` is one of 480, 720 or 960. The response is a WebP (quality 78) no wider
  than that, never enlarged. Any other `w` is a 400. GIF and animated sources
  keep their original bytes; a failed re-encode falls back to the original.
- Responses keep `public, max-age=86400, stale-while-revalidate=604800`, an
  ETag per source and width, and `nosniff`. No `Vary` is sent: the output
  does not depend on request headers.
- Sources without a query string or fragment are kept in an in-memory LRU
  per API process (24 h, 32 MiB, 512 entries; one entry at most 4 MiB), and
  concurrent misses share one upstream fetch. A cached cover and its
  `If-None-Match` revalidation never reach the upstream. Errors, rejected
  responses and failed re-encodes are not cached. Sources with a query string
  are relayed as before and never cached, so cache-busting parameters cannot
  force re-encodes. A restart empties the cache.
- `X-Article-Cover-Cache: HIT|MISS` shows whether the process cache answered.
- Article cards and the home teasers request the variants through
  `srcset`/`sizes` ([public articles](public-articles.md),
  [public home](public-home.md)).

## Browser migrations

The following required sources must resolve through the same-origin route:

- `db.kolodahs.ru` cosmetic and Battlegrounds assets;
- `bg.kolodahearthstone.ru` Battlegrounds UI assets;
- `art.hearthstonejson.com` card art;
- `api.hearthstonejson.com` public card JSON;
- `hearthstone.wiki.gg` gallery media, including bounded
  `/wiki/Special:Redirect/file/` image URLs that resolve to `/images/`;
- required static HSReplay art used by the bundled deck renderer.

## Verification

1. Route tests cover source/path rejection, redirect validation, content-type
   rejection, byte limits, range forwarding, and cache/security headers.
2. A browser-source contract test rejects direct required upstream URLs from
   production frontend sources.
3. Cosmetics, Battlegrounds library/builders, and constructed-card tests pass.
4. TypeScript, production build, Semgrep, Gitleaks, and Nginx contract tests
   pass.
5. Chrome network inspection on production shows no direct requests to the
   required upstream hosts.
6. Robots and Nginx contract tests prove that only the closed public-media
   route list can omit the API `noindex` header.

## Rollback

Revert the release commit. Existing upstream URLs remain valid server-side, so
no data migration or irreversible state change is involved.
