# Next.js route coverage ledger

This ledger is the completion checklist for the [full-site migration](nextjs-full-site-migration.md).
It names every entry in `src/shared/seo/publicRouteInventory.json` at the
2026-09-24 baseline. A route is complete only when its Next implementation,
Nginx owner, direct-load status, metadata, permissions and browser behavior
have been checked together. A route count alone is not a completion signal.

## Already served by Next.js (43 inventory entries)

- `home` — `/`
- `faq` — `/faq`
- `privacy` — `/privacy`
- `terms` — `/terms`
- `gallery` — `/gallery`
- `developer-api` — `/developers/api`
- `articles` — `/articles`
- `contests` — `/contests`
- `winrates` — `/classes`
- `tierlist` — `/tierlist`
- `legendaries` — `/legendaries`
- `standard-cards` — `/standard/cards`
- `standard-cards-format` — `/standard/cards/:format`
- `standard-card-detail` — `/standard/cards/:format/:cardId`
- `standard-matchups` — `/standard/matchups`
- `standard-meta` — `/standard/meta`
- `fun-decks` — `/standard/fun-decks`
- `standard-vicious-gold` — `/standard/vicious-gold`
- `constructed-archetypes` — `/standard/archetypes`
- `guides-archive` — `/guides-archive`
- `guides-archive-detail` — `/guides-archive/:guideSlug`
- `constructed-archetype-detail` —
  `/standard/archetypes/:format/:archetypeSlug`
- `standard-meta-legacy-detail` —
  `/standard/meta/:format/:archetypeSlug`
- `bg-heroes` — `/heroes`
- `bg-hero-detail` — `/heroes/:dbfId`
- `bg-library` — `/library`
- `bg-library-kind` — `/library/:kind`
- `bg-library-archive-root` — `/library/archive`
- `bg-library-archive` — `/library/archive/:kind`
- `bg-library-detail` — `/library/:kind/:slugAndDbfId` for minions and spells
- `bg-library-additional-detail` —
  `/library/:additionalKind/:slugAndDbfId` for all seven supported kinds
- `bg-library-archive-detail` —
  `/library/archive/:kind/:slugAndDbfId` for all seven supported kinds
- `cosmetics` — `/cosmetics`
- `cosmetics-kind` — `/cosmetics/:kind`
- `cosmetics-detail` — `/cosmetics/:kind/:cardId`
- `bg-tier-list` — `/battlegrounds/tier-list`
- `bg-strategies` — `/battlegrounds/strategies`
- `bg-tier-builder` — `/battlegrounds/tier-builder`
- `application-connect` — `/connect`
- `public-profile` — `/id/:publicProfileId`
- `legacy-public-profile` — `/profiles/:legacyPublicProfileId`
- `admin-panel` — `/admin`
- `unknown-path` — `/:path*`; real 404 from the public Next shell.

Both Battleground builders retain saved state, imports, exports and legacy
script assets through Next's client-side controls. The public Nginx owner
routes both builders and their invalid descendants to Next.

## Remaining identity and admin HTML (1)

- `wild-archetype-decks` — `/archetypes/wild`

The `/admin/` App Router document now serves through its exact Nginx rule.
The guest, administrator and blocked-account states use the existing Express
session authority; successful and failed HTML remains private and noindex.

Keep `/identity/` callbacks and session authority in Express. Public profile
data must come from the existing serializer; admin and account state must not
leak into shared HTML, hydration payloads or caches.
Both public-profile patterns use the Express public projection, numeric
canonical, noindex/follow for valid profiles and real Next 404s for invalid
or missing IDs. The edge routes the entire `/id` and `/profiles` namespaces
to Next and prevents private or stale upstream caching.
The `/connect` browser flow remains on the existing Express authorization API;
its Next-owned HTML contains no device code or account data before hydration.

## Resolved redirect and removed contracts (3)

- `referral-redirect` — `/r/:slug`; Express retains 302 and missing-slug 404.
- `removed-decks` — `/decks/:path*`; the edge retains HTTP 410.
- `removed-jobs` — `/jobs/:path*`; the edge retains HTTP 410.

These entries are status contracts rather than active HTML pages. Their
status, location and robots headers remain in regression checks.

## HTML surfaces outside the 47-entry inventory

- `/deck-builder/` and `/archetypes/` are separate admin tools with explicit
  Nginx document and slash-redirect rules. Migrate each to an App Router page
  with `noindex` and authenticated browser checks.
- `/admin/` is already counted above, but its exact Nginx rule and internal
  operations tabs need separate permission and direct-load checks.
- `/?login` is a login overlay state, not another path. The Next-owned home
  page preserves its query policy and login/logout behavior. The Next public
  shell sends its account control there. `/profile/` still returns 404 and is
  not counted as a live page.
- `/404.html` is an internal Nginx error document generated from `dist` today.
  Replace that dependency when Next owns unknown HTML, while keeping an
  independent emergency error response for technical paths.
- The Yandex verification HTML file is a technical static asset, not an app
  page. Preserve its URL without relying on the Vite build.

Express retains `/api/`, `/identity/`, health, metrics, uploads, image/data
endpoints and sitemaps. Their HTML error responses and redirects still need
status/header checks, but those endpoints do not become Next pages.
