# Battlegrounds library access

The `/library/` listing has a staged Next.js route with public title,
description and canonical URL. Guests see an anonymous description and a
subscription gate; the existing `BgLibrary` client mounts only after the
`battlegrounds` entitlement or administrator role is verified. Guest HTML and
browser requests must not include the protected `/api/bg/library/*` data.

The minion and spell listings, `/library/archive/`, and the minion and spell
archive listings are staged in Next.js with their existing SEO registry
metadata. Each guest page shows its category description and no protected API
requests; a subscriber or administrator sees the existing `BgLibrary` filters.
Other categories and all card details stay with the legacy renderer until
their filters, card data, missing-entity status and SEO contract move. Public
Nginx traffic for every staged library route remains legacy until deployment
and browser checks pass.
