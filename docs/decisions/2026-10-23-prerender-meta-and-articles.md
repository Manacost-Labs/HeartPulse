# Prerender `/standard/meta/` and `/articles/`

## Status

Accepted on 2026-10-23 at the owner's request.

## Context

Both pages were `force-dynamic` only because the server read an anonymous
seed (the meta teaser, the article list) for the first paint. A dynamic
page's prefetch brings its route tree but not its content or code, so on a
phone a tap waited for the server and then for the page's chunks: 689 ms to
the new heading on `/standard/meta/` with slow 4G and a 4× slower CPU,
against 96–170 ms for the prerendered sections.

## Decision

- Both pages export `revalidate = 300` and `seoStaticPageMetadata`; their
  Express reads use `next: { revalidate: 300 }` and the meta read gets a 5 s
  budget, since regeneration runs after the visitor has the previous copy.
- CI builds without the Express API, so the build copy carries an empty seed.
  Right after the deploy, the CI step
  `scripts/warm-prerendered-pages.mjs` (the runner is on the production host)
  checks that Express answers, calls `POST /health/next/revalidate/` on
  `127.0.0.1:4321` (accepted only as a direct call on the host) and requests
  both pages until the regenerated copy answers. Until then the browser loads
  the data itself, the article list included.
- The loaders never throw. After `revalidatePath` the next request renders in
  place, so a throw would answer 500 (measured with Express down); a failed
  read ships the empty seed and the browser fills the page instead.
- Query-dependent robots move to Nginx, as for the other prerendered pages:
  `/articles/?page=2` is `noindex, follow` through `X-Robots-Tag`.

## Consequences

- Releases are read-only directories, so `experimental.isrFlushToDisk` is
  off: regenerated copies and the fetch cache stay in the Next process's
  memory (they were already failing to write `.next/cache` with `EACCES` for
  every prerendered page) and start from the build copy after a restart.

- Measured on a production build against the live API: the first tap to
  `/standard/meta/` on the same phone profile shows the page in 213 ms.
- The pages may show data up to five minutes older than Express.
- Pages that read their query on the server (library, cards, archetypes,
  cosmetics, patches, fun decks) stay dynamic; making them prerendered needs
  their filters moved to the browser first.
