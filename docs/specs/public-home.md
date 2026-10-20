# Public home page

The Next.js `/` route renders an anonymous, request-time home page while
production Nginx continues to serve the legacy route until cutover. It reads
`/api/home/summary` and `/api/articles` from Express without forwarding the
visitor's cookie. The serialized summary contains only the class id, name and
win rate needed by the hero; article data uses the existing public projection.

The latest articles appear in the server HTML. Their covers stay lazy and
offer the `/api/article-cover` AVIF and WebP variants (admin uploads too)
through a `<picture>` and `srcset`; the lead
teaser and the other two have separate `sizes` that follow the board's
container-query columns. The Battlegrounds and Arena directories render with
the page. FAQ content lives on `/faq/`, without an extra accordion on the home
page or an FAQPage node in its structured data. If either
public feed is unavailable, the other content and navigation remain usable.

`/?login` keeps the canonical home URL and a `noindex, nofollow` policy. Its
account form loads in the browser because the existing login component uses
browser session storage. Authentication and subscription decisions continue
to belong to Express; Next never serializes a visitor's session into the page.
