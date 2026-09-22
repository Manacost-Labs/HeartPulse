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
