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

Each card cover offers the 480, 720 and 960 px WebP variants of
`/api/article-cover` through `srcset`, with `sizes` matching the grid (one
column below 640 px, two below 1024 px, three beside the sidebar, 446 px at
most), so a phone at DPR 3 loads the 960 px variant and a desktop at DPR 1 the
480 px one. The first card's cover is the largest paint on phones: it loads
eagerly with `fetchpriority="high"` (React also preloads it from the head);
the other covers stay lazy. Uploaded covers (`/uploads/...`) keep a single
`src`. See [same-origin public content](same-origin-public-content-proxy.md)
for the variant contract.

The page preserves `/articles/` as its canonical URL. Query filters such as
`?search=` are `noindex, follow`. Nginx applies this header on successful
responses and
marks Next error responses `noindex, nofollow`. Missing article data shows an
empty listing, while upstream failures return an error state with retry.

Voting requires an authenticated user and the existing article entitlement.
VIP article links are requested from Express only after the browser confirms
the current subscription; public article links retain their existing external
destination.
