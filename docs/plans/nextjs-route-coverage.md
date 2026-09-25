# Next.js route coverage ledger

This ledger is the completion checklist for the [full-site migration](nextjs-full-site-migration.md).
It names every entry in `src/shared/seo/publicRouteInventory.json` at the
2026-09-24 baseline. A route is complete only when its Next implementation,
Nginx owner, direct-load status, metadata, permissions and browser behavior
have been checked together. A route count alone is not a completion signal.

## Already served by Next.js (30 inventory entries)

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

## Battlegrounds and cosmetics data HTML (6)

- `cosmetics` — `/cosmetics`
- `cosmetics-kind` — `/cosmetics/:kind`
- `cosmetics-detail` — `/cosmetics/:kind/:cardId`
- `bg-library-additional-detail` —
  `/library/:additionalKind/:slugAndDbfId` (Next route staged with a public
  projection; Nginx still serves the legacy renderer)
- `bg-library-archive-detail` —
  `/library/archive/:kind/:slugAndDbfId` (Next route staged for all seven
  supported kinds; Nginx still serves the legacy renderer)
- `bg-tier-list` — `/battlegrounds/tier-list`

Match static, archive and detail routes in that order so a broad dynamic
segment cannot swallow a more specific page. Sample live and absent entity IDs.

## Interactive Battlegrounds HTML (2)

- `bg-strategies` — `/battlegrounds/strategies`
- `bg-tier-builder` — `/battlegrounds/tier-builder`

Preserve saved state, imports, exports and the assets used by legacy scripts.

## Identity, connection and admin HTML (5)

- `application-connect` — `/connect`
- `public-profile` — `/id/:publicProfileId`
- `legacy-public-profile` — `/profiles/:legacyPublicProfileId`
- `admin-panel` — `/admin`
- `wild-archetype-decks` — `/archetypes/wild`

Keep `/identity/` callbacks and session authority in Express. Public profile
data must come from the existing serializer; admin and account state must not
leak into shared HTML, hydration payloads or caches.

## Redirect, removed and fallback contracts (4)

- `referral-redirect` — `/r/:slug`; retain its authoritative redirect owner.
- `removed-decks` — `/decks/:path*`; preserve the existing removed-URL status.
- `removed-jobs` — `/jobs/:path*`; preserve the existing removed-URL status.
- `unknown-path` — `/:path*`; Next must return a real 404 for unknown HTML.

These entries are not four active pages. Their status, location and robots
headers still belong in the final route matrix and regression checks.

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
