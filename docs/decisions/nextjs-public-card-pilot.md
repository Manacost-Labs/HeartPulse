# Incremental Next.js public-card pilot

Status: accepted for local development; production ownership remains legacy.

## Decision

Use Next.js App Router **16.3.6**, pinned to the stable npm dist-tag verified on
2026-09-22. Node 22 and the existing React 19 satisfy its peer/runtime contracts.
The official documentation also identifies version 16.3.6. The isolated app is
`apps/public-web`; the Vite entry, Express APIs, SQLite, Redis and jobs retain
their current runtime. Next has no database connection and starts no jobs.

Keep request-time rendering and explicit public projection for the pilot.
Static export cannot provide authoritative 404s and request-time catalog
recovery. Do not migrate the whole SPA or introduce a second authentication
system. Reuse the current React detail presentation through an app adapter.

URL ownership is explicit in `apps/public-web/routeOwnership.mjs`. With the
flag off, all URLs stay legacy. With it on, Standard/Wild card details and Next
assets belong to Next; catalog lists, APIs, sitemap, robots, accounts and every
other page remain legacy. The local loopback gateway demonstrates switching and
rollback with identical query strings, cookies and request bodies.

Block metadata streaming for this bounded pilot so absence and metadata resolve
before status/HTML are sent. There is no `loading.tsx` boundary. Test HTTP status
with browser and bot user agents; a streamed 200 is not an acceptable 404.

## Runtime boundaries

The server loader calls only the allowlisted public Express read model, with
no credentials, no redirect following, no cache and a bounded deadline. React's
request-local cache deduplicates page and metadata reads. The hydration seed
contains public facts and `stats: null`; account and subscription reads start
in the browser. Paid statistics remain guarded by the existing Express policy.
Unavailable data produces a retryable HTTP 500, while authoritative absence
produces HTTP 404. Neither response is a public cache entry. Retry refreshes
the server component before resetting the error boundary.

Next's proxy derives the validated card identity from the request pathname and
overwrites internal identity headers. Both metadata and the page use those
values: runtime tests found inconsistent encoded/decoded params between the
two entry points. Client-supplied headers cannot select a different card.
Trailing-slash redirects preserve query parameters; canonical URLs exclude them.

The adapter reuses `StandardCards`, public navigation, profile presentation,
menu focus/scroll behavior and the footer. Pure navigation metadata is separate
from legacy route loaders so Next does not import the entire SPA. The card
module owns statistics query policy and its hooks. Entity-to-text conversion
uses the same DOM-independent implementation on the server and in the browser.

## Bundling compatibility

Build and development use Webpack. An extension alias resolves existing `.js`
imports to their TypeScript sources. One exact vendored HSReplay UMD file uses
`javascript/auto` so it receives its own CommonJS wrapper. Without that rule,
its `module.exports` replaced Next page exports after the first successful
request. The production integration test renders multiple identities and
aliases in one process, covering that regression. No dependency is patched.

The Next project is typechecked separately; `lint:domains` enables strict mode
for the completed account, Arena, BG and card slices. Existing global strictness
and architecture exceptions are not relaxed.

## Sources

- [Official Vite migration guide](https://nextjs.org/docs/app/guides/migrating/from-vite)
- [Official self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js repository](https://github.com/vercel/next.js)
- [Blocking metadata configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/htmlLimitedBots)
- [Not-found status semantics](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)

The Vite guide starts with SPA compatibility; this project additionally needs
indexable card HTML, so it uses a public server loader rather than static export.
The self-hosting guide recommends a reverse proxy. Production Nginx remains the
edge; the loopback gateway is a local/staging tool, not a replacement for TLS,
rate limiting, request limits or the established deployment service.
