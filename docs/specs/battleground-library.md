# Battlegrounds library access

The `/library/` listing has a staged Next.js route with public title,
description and canonical URL. Guests see an anonymous description and a
subscription gate; the existing `BgLibrary` client mounts only after the
`battlegrounds` entitlement or administrator role is verified. Guest HTML and
browser requests must not include the protected `/api/bg/library/*` data.

Category, archive and detail paths stay with the legacy renderer until each
path family preserves its filters, card data, missing-entity status and SEO
contract in Next.js. Public Nginx traffic for `/library/` also stays legacy
until the staged release and browser checks pass.
