# Battlegrounds library access

The `/library/` listing is served by Next.js with a public title,
description and canonical URL. Guests see an anonymous description and a
subscription gate; the existing `BgLibrary` client mounts only after the
`battlegrounds` entitlement or administrator role is verified. Guest HTML and
browser requests must not include the protected `/api/bg/library/*` data.

All nine allowed `/library/:kind/` categories, `/library/archive/`, and all
seven allowed `/library/archive/:kind/` categories are served by Next.js.
Minion and spell listings retain their existing SEO registry metadata; the
additional categories carry local Next metadata. Unsupported archive
categories and unknown kinds return 404. Each
guest page shows its category description without protected API requests;
subscribers and administrators retain the existing `BgLibrary` filters.
All supported current and archive detail pages are served by Next.js. Server
HTML contains
only the anonymous card identity, safe image, rules text and indexable entity
JSON-LD with the canonical URL; the existing
`BgLibrary` detail client mounts after entitlement or administrator checks.
Unknown card IDs return 404, and a noncanonical slug redirects to the
canonical card URL. Catalog outages return non-cacheable 503 HTML with
`Retry-After` and `noindex, nofollow`. Public Nginx traffic for the listing,
categories and all supported card details goes to Next.js.

The anonymous `/api/bg/library/public/:kind/:dbfId` endpoint projects only
public minion and spell identity as the existing detail HTML. Both detail
readers first request the established local `/api/bg/library/cards/by-dbf/:id`
projection, validate its exact DBF, kind, pool and required public fields, and
discard statistical fields. A malformed or unsuccessful single-card response
falls back to the complete validated active/archive catalogs; the local proxy
maps upstream absence to 502, so that response alone cannot prove a 404.
It returns a canonical path and public
card fields, 404 for invalid or absent IDs, and retryable 503 when the catalog
cannot be verified. Cookies and authorization do not affect its response;
private statistics are never included.

Single-card snapshots share concurrent reads by kind and DBF, across anonymous
public and legacy detail readers. At most 512 identities or in-flight reads are
retained per process; settled least-recently-used entries can be evicted. The
default fresh interval is five minutes and the stale grace is 15 minutes after
expiry. Known compatible cards may be served during one background refresh,
with a 30-second failure cooldown. Failure does not renew their age. Missing
identities are not negatively cached; an expired active snapshot cannot prove
archive absence. Each source read, including a catalog fallback, retains the
existing 20-second overall deadline. A cold process still needs a successful
source response; there is no new disk snapshot, timer or protected API call.

The `/api/bg/library/public/archive/:kind/:dbfId` endpoint projects
only out-of-pool minions and spells with an archive canonical path. The
`/api/bg/library/public/extra/:pool/:kind/:dbfId` endpoint accepts the seven
additional current categories and the five supported archive categories. It
queries the established catalog with an exact DBF filter, rejects a mismatched
identity or pool, and returns only bounded public identity, rules text, safe
image and canonical path. Unsupported kinds and missing cards return 404;
catalog failures return non-cacheable 503 with `Retry-After`. The Next.js
additional and archive detail routes consume these projections, render public
identity and entity JSON-LD, and load protected statistics only after an
entitlement or administrator check. Unsupported kinds and missing IDs produce
real 404 HTML; upstream outages produce retryable 503 HTML.

## Bounded catalog refresh for public details

The anonymous minion/spell catalog keeps its five-minute fresh lifetime and
coalesces one active/archive fetch pair per kind. A known identity may use the
last successful snapshot for fifteen more minutes while that pair refreshes.
An archive lookup is known only if its cached card is already outside the pool.
Missing identities and newly archived cards wait for fresh confirmation; a
failed source produces 503 rather than a stale 404. Failure retries have a
30-second cooldown. Empty, conflicting or invalid replacement identities cannot
replace a good catalog; failures never extend its maximum lifetime. The existing
source deadline still applies. The cache is process-local and contains no viewer
data. A cold process still needs a successful source read.
