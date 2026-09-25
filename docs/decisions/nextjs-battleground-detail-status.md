# Next.js Battleground detail status at the route boundary

Status: accepted for the staged hero and base library detail routes,
2026-09-25.

## Context

The Express public projection distinguishes a missing Battleground entity
(404) from an unavailable catalog (503 with `Retry-After`). A Next App Router
page can use `notFound()` for 404, but an exception during its render produces
500, losing the retry contract. Nginx cannot switch the detail URLs while
their error statuses differ.

## Decision

Next Proxy probes only GET/HEAD requests for numeric hero details and
minion/spell card details through the anonymous Express public API. It strips
any client-supplied internal projection header. A valid 200 projection is
validated, reduced to public fields, capped at 4,096 encoded header
characters, and passed to the page in an internal request header. The page
validates it again. A 404 passes a missing marker to the page, which returns
its normal Next 404 and `noindex`. An upstream failure, invalid projection or
oversized header returns a private, non-cacheable HTML 503 with a bounded
`Retry-After` and `noindex, nofollow`. No cookies or authorization headers are
sent to the public projection API. Paid statistics remain behind the existing
client entitlement check and Express API.

## Consequences

The status check and render use one authoritative public API response in the
normal case, so a catalog outage cannot turn into a second-fetch 500. The
short-lived internal header is constrained in size and carries no private
statistics. An unusually large but valid public projection fails closed with
a retryable 503; the projection contract must be narrowed or the limit
revisited if this becomes observable. This Proxy path is temporary
compatibility code for the detail-family cutover; it does not become a general
application data transport.

The edge owner must remain Express until this behavior is deployed, sampled
on port 4321, browser-checked, and its Nginx contract is installed separately.
