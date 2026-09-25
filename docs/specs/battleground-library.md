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
public minion and spell identity from the same verified active and archive
catalogs as the existing detail HTML. It returns a canonical path and public
card fields, 404 for invalid or absent IDs, and retryable 503 when the catalog
cannot be verified. Cookies and authorization do not affect its response;
private statistics are never included.

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
