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
- `/wallpaper/wiki-battlegrounds-skin.webp`
- `/wallpaper/battlegrounds-bartender-header.webp`

Do not hotlink wiki assets at runtime.

## Layout Rules

- One continuous page canvas and one predictable `1280–1320px` content width.
- Builders may use the wide workspace but remain inside the same material system.
- App mobile navigation stays fixed below its topbar; deferred-shell mobile rules stay scoped below `.arena-main`.
- Verify `390px` with no document-level horizontal scroll and minimum `42px` touch targets.

## Battlegrounds Rules

- Root hook: `.arena-app-battlegrounds`.
- Route hooks: `.bg-heroes-page`, `.bg-hero-detail-page`, `.bg-library-page`, `.bg-library-detail-page`, `.bg-tier-list-page`, `.bg-builder-page`.
- Styles stay scoped in `src/battlegrounds-parchment.css`.
- Use dusty violet for active controls, parchment for filters and wood for major rules.
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

- **2026-07-10** — Synchronized with the canonical parchment/Battlegrounds design system in `design.md`.
