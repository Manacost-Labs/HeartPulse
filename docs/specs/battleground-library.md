# Battlegrounds library access

The `/library/` listing has a staged Next.js route with public title,
description and canonical URL. Guests see an anonymous description and a
subscription gate; the existing `BgLibrary` client mounts only after the
`battlegrounds` entitlement or administrator role is verified. Guest HTML and
browser requests must not include the protected `/api/bg/library/*` data.

All nine allowed `/library/:kind/` categories, `/library/archive/`, and all
seven allowed `/library/archive/:kind/` categories are staged in Next.js.
Minion and spell listings retain their existing SEO registry metadata; the
additional categories carry local Next metadata until their public owner
changes. Unsupported archive categories and unknown kinds return 404. Each
guest page shows its category description without protected API requests;
subscribers and administrators retain the existing `BgLibrary` filters.
All card details stay with the legacy renderer until their data, missing-entity
status and SEO contracts move. Public Nginx traffic for every staged library
route remains legacy until deployment and browser checks pass.

The anonymous `/api/bg/library/public/:kind/:dbfId` endpoint projects only
public minion and spell identity from the same verified active and archive
catalogs as the existing detail HTML. It returns a canonical path and public
card fields, 404 for invalid or absent IDs, and retryable 503 when the catalog
cannot be verified. Cookies and authorization do not affect its response;
private statistics are never included.
