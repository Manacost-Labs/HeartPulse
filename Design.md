# HS-Arena Design System

> Compatibility pointer to `design.md`. Keep this summary aligned until the duplicate is removed in a dedicated cleanup.

The canonical design specification is stored in [`design.md`](./design.md). This file carries only the non-negotiable summary so case-sensitive and case-insensitive tooling cannot read contradictory guidance.

## Product Direction

HS-Arena is a Hearthstone statistics product presented as a readable game compendium. Use a continuous parchment canvas, red textured navigation, thin wood separators, real game assets and a restrained game-mode accent. Existing filters, lightboxes, tier grids, drag/drop builders, exports and protected animations must remain intact during visual work.

## Canonical Tokens

- Parchment: `#ead6a7`, `#f7e8bf`
- Ink: `#30251c`; muted ink: `#735e49`
- Wood: `#2e160b`, `#5f371d`
- Arena red: `#8d171d`, `#5d0d13`
- Battlegrounds violet: `#8f536d`, `#3d2335`, `#2a1725`
- Accent gold: `#d9ab49`, `#efc96f`
- Display type: `HSDisplay`; body type: `Inter`

## Canonical Assets

- `/wallpaper/arena-parchment.jpg`
- `/wallpaper/arena-rail-red.jpg`
- `/wallpaper/main-page-rail-border.png`
- `/wallpaper/deck-border.png`
- `/wallpaper/wiki-battlegrounds-skin.webp`
- `/wallpaper/battlegrounds-bartender-header.webp`

Do not hotlink wiki assets at runtime.

## Layout Rules

- One continuous page canvas and one predictable `1280–1320px` content width.
- Builders use the full workspace after the desktop rail; their BG frame is `20–28px`, the library takes roughly `32%`, and annotations move below canvases narrower than `860px`.
- App mobile navigation stays fixed below its topbar; deferred-shell mobile rules stay scoped below `.arena-main`.
- Verify `390px` with no document-level horizontal scroll and minimum `42px` touch targets.
- Profile hierarchy uses the large wood frame for hero/settings/access, the deck frame for short statuses and subscription sources, and plain parchment inputs for readability.

## Home Rules

- Lead with live freshness, Arena leaders, source count and direct actions instead of quotes or oversized marketing copy.
- Use `/wallpaper/home-paladin-hero.webp` as the masked first-screen character mural with a clearly left-biased desktop composition so the hero remains visible beside the class board; keep copy on the red field and turn the art into a short panorama on mobile.
- Do not add a duplicate freshness/source/leader footer strip inside the home hero; the main composition closes directly at the wooden frame.
- Keep the order Battlegrounds directory → Arena directory → editorial/community content; do not restore the removed “Мета в цифрах” aggregate.
- Frame major home regions with canonical wood assets; keep inner rows quiet, parchment-based and free of generic colored side rails.

## Battlegrounds Rules

- Root hook: `.arena-app-battlegrounds`.
- Route hooks: `.bg-heroes-page`, `.bg-hero-detail-page`, `.bg-library-page`, `.bg-library-detail-page`, `.bg-tier-list-page`, `.bg-builder-page`.
- Styles stay scoped in `src/battlegrounds-parchment.css`.
- Use dusty violet for active controls, parchment for filters and wood for major rules.
- Do not use violet side rails or colored left-border strips on BG panels; use wooden frames/rules for major separation and quiet neutral borders inside them.
- BG tier navigation uses walnut/burgundy idle cards and violet/gold selected cards; rank groups use honey parchment, never cold white/blue dashboard surfaces.
- BG library detail dossiers and major ledgers use canonical timber rails with honey parchment inside; long names, groups, sources and metric values wrap safely.
- BG tier entries use explicit theme hooks rather than DOM-position selectors, and strategy/card lightboxes use timber rails over red tavern cloth instead of plain black panels.
- The BG heroes introduction uses one title divider and one quiet combined metric/search panel; utility panels do not receive decorative bottom rails.
- Arena cards, deck cards, BG strategies, BG hero media and gallery art share one timber-framed red-cloth lightbox material; white, transparent and plain black modal panels are not valid.
- Hero details use the large rail frame for the identity dossier, a thin rail slice for major ledgers, and the deck frame for hero-power/companion media; names wrap safely and descriptions are not clamped.
- Preserve hero-power/related-card reveals, golden-card dual-layer animation, tier lightboxes and builder drag/drop/export behavior.
- Builders use the wiki BG frame and a dark aubergine work surface; edit CSS variables before touching legacy scripts.

## Accessibility And Motion

- Decorative signs never replace real headings.
- Selected buttons expose `aria-pressed` when applicable.
- Focus-visible is as clear as hover.
- Prefer opacity/translate/transform and honor `prefers-reduced-motion`.
- Never recolor card, mana, rarity or hero artwork with CSS filters.

## QA

1. Run `npm run lint` and a production Vite build.
2. Capture `1440px` and `390px` screenshots.
3. Confirm no 390px overflow.
4. Verify hero search/hover, library filters/card navigation/golden reveal, BG tier state/lightbox, and builder mount/drag-drop/export buttons.
5. For GitHub-only tasks, push the feature branch; do not deploy production.

## Changelog

- **2026-07-11** — Simplified the BG heroes controls into one rail-free metric and search panel.
- **2026-07-11** — Shifted the home Paladin farther left so the character remains visible beside the Arena class board.
- **2026-07-11** — Unified all content lightboxes with timber rails, red tavern cloth, cream/gold copy and responsive artwork stages.
- **2026-07-11** — Removed the aggregate “Мета в цифрах” block from the home page and its quick-navigation link.
- **2026-07-11** — Shifted the home character crop left and removed the duplicate hero status footer.
- **2026-07-11** — Added timber-framed BG card dossiers, overflow-safe metadata, stable honey-parchment tier entries and the red tavern-cloth strategy lightbox.
- **2026-07-10** — Defined the utility-first home hierarchy and real-data Battlegrounds hero spotlight chart.
- **2026-07-10** — Removed generic colored side rails from Battlegrounds panels and directory entries in favor of wooden hierarchy and neutral boundaries.
- **2026-07-10** — Added the Battlegrounds hero-dossier frame hierarchy and overflow-safe hero media rules.
- **2026-07-10** — Added the wide-builder, dark BG tier-ledger and corrected profile-plaque composition rules from the canonical specification.
- **2026-07-10** — Synchronized with the canonical parchment/Battlegrounds design system in `design.md`.
