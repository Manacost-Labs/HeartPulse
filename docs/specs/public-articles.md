# Public articles page

The Next.js App Router owns `/articles/` after the direct-port release check
and Nginx cutover. Express remains the authority for
`GET /api/articles`, article votes and signed VIP access links.

The initial HTML uses a request-time, anonymous `GET /api/articles` without
forwarding the visitor's cookie. Only article card fields and public vote
counts enter the HTML and hydration payload. A signed-in browser fetches its
own article projection from Express after hydration; failed personal refresh
keeps the public listing visible with a retry notice. The page never caches a
private projection in shared Next state.

Each card cover offers the 480, 720 and 960 px AVIF and WebP variants of
`/api/article-cover` through a `<picture>` and `srcset`. The AVIF `<source>`
comes first, and the `<picture>` has `display: contents`, so the image keeps
its box. `sizes` matches the grid (one column below 640 px, two below 1024 px,
three beside the sidebar, 446 px at most), so a phone at DPR 3 loads the
960 px variant and a desktop at DPR 1 the 480 px one. The first card's cover
is the first image in view on phones: it loads eagerly with
`fetchpriority="high"`. React does not preload an image inside `<picture>`,
so no head hint can fetch the WebP besides the chosen AVIF. The other
covers stay lazy with `decoding="async"`. Because Chrome records LCP only once
an animation on the image or an ancestor ends, the page skips the first-load
rise and the first card skips its card entrance. Admin uploads
(`/uploads/admin/<name>.webp`) use the same variants through `?upload=<name>`;
other `/uploads/...` covers keep a single `src`. See
[same-origin public content](same-origin-public-content-proxy.md) for the
variant contract.

The page preserves `/articles/` as its canonical URL. Query filters such as
`?search=` are `noindex, follow`. Nginx applies this header on successful
responses and
marks Next error responses `noindex, nofollow`. Missing article data shows an
empty listing, while upstream failures return an error state with retry.

Voting requires an authenticated user and the existing article entitlement.
VIP article links are requested from Express only after the browser confirms
the current subscription; public article links retain their existing external
destination.
