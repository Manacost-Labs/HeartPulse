# Public home page

The Next.js `/` route renders an anonymous, request-time home page while
production Nginx continues to serve the legacy route until cutover. It reads
`/api/home/summary` and `/api/articles` from Express without forwarding the
visitor's cookie. The serialized summary contains only the class id, name and
win rate needed by the hero; article data uses the existing public projection.

The latest articles appear in the server HTML. Battlegrounds, Arena and FAQ
sections keep their viewport-based loading behavior after hydration. If either
public feed is unavailable, the other content and navigation remain usable.

`/?login` keeps the canonical home URL and a `noindex, nofollow` policy. Its
account form loads in the browser because the existing login component uses
browser session storage. Authentication and subscription decisions continue
to belong to Express; Next never serializes a visitor's session into the page.
