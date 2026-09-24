# Public contests page

The Next.js `/contests/` route is prepared behind the legacy production Nginx
owner. Express remains the authority for `GET /api/contests`, subscription
status and contest joins.

The server renders only an anonymous, request-time contest projection. It does
not forward the visitor's cookie and strips creator metadata and personal
entry state from the HTML. After hydration, a signed-in browser refreshes its
own entries through the existing same-origin API. A failed personal refresh
leaves the public listing visible with an error message.

Joining still requires an authenticated visitor and a fresh subscription
check. The browser submits to the Express join endpoint; Next does not make an
independent entitlement decision or write directly to the database.

The canonical URL remains `/contests/`. Metadata follows the shared public
URL policy; upstream errors show a retry state, while an empty list keeps the
existing empty-state message.
