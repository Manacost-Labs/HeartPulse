# Same-origin delivery for public content

## Objective

Required images, audio, video, and public JSON used to render
`arena.hs-manacost.ru` must be requested by the browser from
`arena.hs-manacost.ru`. Upstream services may still be contacted by the Arena
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
- External runtime libraries are bundled with the application instead of
  being loaded from a third-party CDN.

## Browser migrations

The following required sources must resolve through the same-origin route:

- `db.kolodahs.ru` cosmetic and Battlegrounds assets;
- `bg.kolodahearthstone.ru` Battlegrounds UI assets;
- `art.hearthstonejson.com` card art;
- `api.hearthstonejson.com` public card JSON;
- `hearthstone.wiki.gg` gallery media;
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

## Rollback

Revert the release commit. Existing upstream URLs remain valid server-side, so
no data migration or irreversible state change is involved.
