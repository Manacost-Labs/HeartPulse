# HS-Arena Design System

> **Purpose of this file.** This is the single source of truth for how HS-Arena (arena.hs-manacost.ru) must look and be built. Any AI agent or developer doing visual work MUST read this file first and follow it. If a requested change conflicts with a rule here, say so before implementing.

## Product Direction

HS-Arena should feel like a modern Hearthstone statistics dashboard: fast, readable, premium, and game-aware without becoming an old parchment fan site.

Primary design goals:
- Lead with data clarity: stats, filters, tiers, and updates must scan quickly.
- Keep Hearthstone flavor through real assets, card art, class icons, and display typography. Do not use warm gold/yellow as a general UI color.
- Avoid heavy brown panels as the default surface. Use dark navy glass and light dashboard surfaces.
- Preserve existing interactive engines: tier grids, card preview, lightbox, filters, and download flows.

## Design Tokens

### Typography

| Token | Value | Usage |
|---|---|---|
| `--font-hs` | `"HSDisplay", "Cinzel", serif` | Legacy alias, tier badges, some BG components |
| `--font-display` | `"HSDisplay", serif` | Brand, section titles, tier labels, primary action text, menu links |
| `--font-body` | `"Inter", sans-serif` | Descriptions, helper text, metadata, long-form text, section labels |

- `HSDisplay` is self-hosted at `/fonts/2318-font.otf` (`@font-face` in `src/index.css`, `font-display: swap`, preloaded in `index.html`).
- `Cinzel` + `Inter` load from Google Fonts (preconnect in `index.html`).
- Letter spacing stays `0` for most UI. Uppercase only for small labels (source names, menu section headers).
- Mobile headings must not wrap awkwardly. Brand text stays readable and compact.

### Color Palette

| Role | Values |
|---|---|
| Deep shell | `#040a14`, `#081020`, `#12233f` |
| Dark glass panels | `rgba(8,18,34,0.98)` → `rgba(6,12,24,0.98)` gradients + `backdrop-filter: blur(16-18px)` |
| Dashboard surface (light) | `#f8faff`, `#ebf1fc` |
| Primary accent | `#2563eb`, `#38bdf8`, `#93c5fd` |
| Borders on dark | `rgba(96,165,250,0.26-0.42)` (blue), `rgba(148,163,184,0.16)` (slate) |
| Active/selected on dark | `linear-gradient(135deg, rgba(30,64,102,0.9), rgba(12,74,110,0.66))`, border `rgba(96,165,250,0.58)` |
| Text on dark | `#e5eefc`, `#d9e3f2`, `#c8d5e8`, `#9fb1ca` |
| Text on light | `#1e293b`, `#334155` |
| Legacy gold (restricted) | `#f6ce68`, `#fff3c4` — brand text, tier dots, and game-asset accents ONLY |

**Hard rule (Color Unification 2026-06-23): no yellow/gold as a UI system color.** Not for cards, FAQ rows, filter strips, source toggles, count pills, empty states, or active controls. Use cool surfaces (white, blue-gray, slate, navy) and blue/cyan for active states, links, progress, rings, and primary actions. Allowed exceptions: card artwork and class icons (source assets), the brand mark, small icon accents.

### Radii

- Large panels / content shell: `24px`
- Floating menus, promo cards: `18-20px`
- Buttons, links, inputs: `12-14px`
- Small chips/pills: `8px` or `999px` (fully round)

### Z-Index Scale (do not improvise)

| Layer | z-index |
|---|---|
| Mobile topbar (`.arena-mobile-topbar`) | 45 |
| Mobile menu panel (`.arena-mobile-menu`, App shell) | 44 |
| Mobile drawer backdrop (`.arena-mobile-drawer-backdrop`) | 43 |
| BG shell dropdown menu (`.arena-main .arena-mobile-menu`) | 40 |
| Lightbox / modals | below 43 unless full-screen |

## Layout Shells — CRITICAL ARCHITECTURE NOTE

The app has **two independent layout shells that share some class names**. This has already caused a production bug (2026-07-01: mobile menu invisible). Respect the scoping.

1. **App shell** (`src/App.tsx`):
   - Desktop ≥1024px (`lg:`): fixed left sidebar (`.arena-sidebar`, `.arena-layout-shell`).
   - Mobile <1024px: sticky topbar (`.arena-mobile-topbar`, z-45) + burger toggle (`.arena-mobile-nav-toggle`) + **fixed** dropdown (`.arena-mobile-menu`, `position: fixed; top: 72px`, z-44) + backdrop (z-43). The menu nav is a direct child of the page root — it must stay `position: fixed`, never `absolute`.
2. **BG/tab shell** (`src/features/DeferredRoutes.tsx`):
   - Inline nav bar inside `main.arena-main`; its dropdown uses `position: absolute` anchored to a `relative` wrapper.
   - Its styles are scoped in CSS as `.arena-main .arena-mobile-menu`, `.arena-main .arena-mobile-nav-toggle`, etc.

**Rules:**
- Never add an unscoped `.arena-mobile-*` rule intended for only one shell. Scope BG-shell rules under `.arena-main`; App-shell rules stay unscoped (they come first in `src/index.css`, ~lines 29–135).
- When adding a new shell or header variant, use NEW class names instead of reusing existing ones.
- `position: absolute` dropdowns require a `position: relative` ancestor of the correct size. In the App shell there is none — use `position: fixed`.

## Breakpoints & Responsive Rules

- App shell switches sidebar ↔ topbar at `1024px` (`lg:`). BG shell mobile nav uses `640px` (`sm:`).
- Every new component must be checked at **390px width** (iPhone) — no horizontal scroll, ever.
- Touch targets: minimum `42px`, prefer `46px` height for menu links and buttons.
- Hover-only affordances must be wrapped in `@media (hover: hover)`; provide `:active` feedback for touch.
- Long dropdowns need `max-height` + `overflow-y: auto` (mobile menu uses `calc(100dvh - 88px)`).
- Respect `prefers-reduced-motion` for every animation.
- Text in constrained rows: `min-width: 0` + ellipsis on the inner `span`.

## Component Class Map

| Class prefix | Component | Defined in |
|---|---|---|
| `.arena-sidebar*` | Desktop sidebar (App shell) | `src/index.css` |
| `.arena-mobile-topbar`, `.arena-mobile-brand` | Mobile sticky header (App shell) | `src/index.css` (~29–56) |
| `.arena-mobile-nav-toggle`, `.arena-mobile-menu*`, `.arena-mobile-drawer-backdrop` | App-shell mobile menu | `src/index.css` (~58–135) |
| `.arena-main .arena-mobile-*` | BG-shell mobile nav (scoped) | `src/index.css` (~1032–1135) |
| `.arena-content`, `.arena-tabs`, `.arena-tab*` | Content panel + tab bar | `src/index.css` |
| `.arena-footer*` | Footer | `src/index.css` |
| `.site-switcher*` | Manacost network switcher | `src/index.css` |
| `.hs-card`, tier grid classes | Cards / tier lists | `src/index.css` + `App.tsx` |

## Surfaces

- Main shell uses blurred Hearthstone artwork behind dark overlays.
- Navigation and modal panels use dark glass with thin, low-opacity borders.
- Content panels use soft light surfaces with subtle cool shadows.
- Avoid yellow/gold borders and parchment fills in UI surfaces. Use blue-gray borders and blue/cyan active states.
- Home page starts with a compact product summary, not a large hero billboard. Useful section cards and data previews appear immediately.
- Section banners share one clean top radius and keep background art centered lower in the frame (`center 78%`) so character art does not look cropped upward.

## Shadows

- App chrome: large but soft dark shadow, low opacity.
- Cards in tier grids: no artificial drop-shadow on the card artwork. Let the real card frame carry depth.
- Hover states can increase depth but should not create muddy halos.
- Modal card art remains hero-sized and shadowed; the stat panel carries the structured UI.

Avoid:
- `rgba(0,0,0,0.85)` on small cards unless the asset needs strong separation.
- Multiple brown shadows layered together.
- Heavy inset shadows on dashboard controls.
- Drop-shadows behind gallery card images (dirty gray field on light backgrounds).

## Motion And Performance

Motion should make the interface feel alive, not slower.

- Prefer opacity, transform, and background-position for animations.
- Avoid permanent `will-change` on repeated card elements; enable it only for hover/focus states.
- Infinite animation only for very subtle, low-frequency atmosphere (banner art drift, active-tab glow).
- Respect `prefers-reduced-motion`.
- Heavy data not required for the first visible screen loads in idle time.
- Avoid `content-visibility: auto` on visible card grids and long export/QA pages; on mobile and full-page screenshots it can leave blank blocks until scroll paints them.
- Performance budget: main JS chunk ≤ ~110 KB gzip, CSS ≤ ~30 KB gzip (`npm run budget` checks this). New heavy features go into deferred chunks.

## Navigation

The current menu structure is approved. Do not rework it unless specifically requested.

- Active tab/link: dark navy with blue/cyan text/icon treatment.
- Menu is a separate floating panel, not attached to the content card.
- Mobile keeps a compact dark nav bar with brand and burger button; the open state swaps the burger icon for an X and sets `aria-expanded`.
- Mobile menu links: dark glass rows (`rgba(15,32,58,0.58)`), slate borders, 46px min height; section headers ("АРЕНА", "ПОЛЯ СРАЖЕНИЙ") are small uppercase `--font-body` labels in `#9fb1ca`.
- Header includes the Manacost site switcher: `Koloda`, `HS-Manacost`, `HS-Arena`. Current site pill glows subtly; external pills stay quieter, use favicon imagery, and open in a new tab.
- On mobile, the site switcher stacks below the brand and scrolls horizontally if space is tight.
- Favicon direction: minimalist monogram, dark rounded square, thin cyan rim, geometric `A` strokes — no shield or nested emblem, so it stays clear at 16–32px.

## Lightbox

Must match the dashboard shell:
- Backdrop: dark blurred glass with subtle blue/cyan radial light.
- Card image: large, clean, no extra frame, soft premium shadow.
- Stats panel: dark navy glass or cool light glass, thin blue-gray border, rounded 20–24px.
- Chips: subdued glass pills, not parchment.
- Stat rows: compact dark rows with readable labels and colored metric values.
- Mobile: image first, stats below, max height constrained so scrolling is comfortable.

Do not:
- Return to heavy brown panels.
- Add decorative text explaining how the lightbox works.
- Change card data logic or source fallback order while doing visual work.

## Hover Card Tooltip

A compact stats popover, not a brown Hearthstone parchment:
- Width around 340px on desktop.
- Light glass dashboard panel with blue-gray border.
- Rows use quiet white pills with strong right-aligned metric values.
- Source label is metadata, not a visual headline.
- Tooltip must not obscure the card more than necessary and stays `pointer-events: none`.
- Tooltip is hover-only — never required for core info on touch devices.

## Tier Lists

Tier-list grid and export/download behavior are **protected**. Visual edits go through CSS around existing classes unless the user explicitly asks for behavior changes.

- Keep card images high quality and large enough for recognition.
- Keep filters compact and scannable; light dashboard filter surfaces with dark active states.
- Tier badges can be game-like, but their shadows stay soft.
- No shadows on raw card images in gallery mode.
- Tier rank badges own their foreground color — global heading/font overrides must not recolor `S/A/B` letters.
- Rarity and mana filter icons render as source assets. No brightness/saturation filters.

## Articles

A modern arena magazine section inside the same dashboard shell:
- Cool white/blue-gray article cards, not parchment.
- Article tags are dark glass chips with readable light text.
- Cover images carry the visual energy; body panels stay quiet and readable.
- No extra intro/status panel above the article grid; after breadcrumbs, the card grid starts immediately.
- Card titles high contrast, excerpts muted; links blue/cyan.

## Home Page

An index/dashboard, not a landing page:
- No oversized hero block with mascot/card artwork.
- Compact intro strip with two primary actions.
- Navigation cards, top classes, top cards, and legendaries close to the first viewport.
- Home surfaces light and crisp, bridging dark navigation and data-heavy pages.

## Community Promo Cards

Telegram and Boosty promo cards sit inside the same cool dashboard system:
- Dark navy/slate glass surfaces with blue/cyan borders and readable light text.
- Source brand colors only as small icon accents, never full-card brown/orange panels.
- Titles define their own high-contrast foreground color.
- On mobile, promo CTAs may stack below the text so labels do not become cramped.

## Paywall / Subscriber Sections

- Locked content stays visible but blurred behind the modal — the user must see WHAT they unlock.
- Paywall modal: light glass panel, `РАЗДЕЛ ДЛЯ ПОДПИСЧИКОВ` kicker, benefit cards, then Boosty (orange accent allowed as brand icon) and Telegram CTA rows, then a quiet "Войти в профиль" button.
- Never fully hide the page structure behind the paywall.

## Footer

A product close, not only a legal strip:
- Dark glass section over faint footer art (`/wallpaper/footer-bg.webp`).
- Three columns: sections, community, project summary/update status.
- Low-contrast legal text in the bottom bar.

## Known Pitfalls (learned in production — do not repeat)

1. **Duplicate class names across shells** (2026-07-01): a second unscoped `.arena-mobile-menu` block overrode the App-shell menu; `position: absolute; top: calc(100% + .45rem)` resolved against the page root, rendering the menu at ~3500px — invisible. Fix: BG-shell rules are scoped under `.arena-main`. Always scope shell-specific rules.
2. **Amber/yellow leakage**: medium winrate badges and progress bars must use blue/green data colors, not amber.
3. **Inherited text color in badges**: any colored metric pill must define its own foreground color; never rely on inherited utilities.
4. **`content-visibility: auto`** on visible grids breaks full-page screenshots and mobile paint.
5. **Icon filters**: brightness/saturation filters make rarity/mana icons look damaged.
6. **Inline styles** in older components: prefer adding semantic classes before visual work.
7. **`.bak` files**: editors keep timestamped `.bak-*` copies next to sources. Never import from or edit `.bak` files; they are not part of the build.

## QA Checklist (run after every design pass)

1. `npm run lint` (tsc) and `npm run build` (vite + prerender) must pass.
2. Screenshot QA at **1440px** and **390px**: `/`, `/tierlist`, `/legendaries`, `/classes`, and the hover tooltip. Headless check: puppeteer-core + `/usr/bin/chromium` with `isMobile: true, hasTouch: true`.
3. Mobile menu: tap burger → panel opens under topbar (top: 72px), all links visible and tappable, tap link → navigates and closes, tap backdrop → closes.
4. No horizontal scroll at 390px (`document.documentElement.scrollWidth === clientWidth`).
5. Verify no new yellow/gold UI surfaces appeared.
6. Production serve notes: `dist/` is served directly by nginx (no reload needed for content changes); `dist/` must stay owned by `www-data:www-data`; build as `koloda` (prerender fixes permissions at the end).

## Implementation Notes

Primary files:
- `src/App.tsx` — App-shell structure and component classes.
- `src/features/DeferredRoutes.tsx` — BG/tab shell and deferred pages.
- `src/index.css` — all shell, tier-list, modal, and menu styling. App-shell mobile styles ~lines 29–135; BG-shell scoped styles ~lines 1032–1135.
- `index.html` — SEO meta, JSON-LD, font preloads, analytics.

Before handoff:
- Run `npm run lint` and `npm run build`.
- Capture desktop and mobile screenshots for visual QA when touching major surfaces.
- Update this file when a new rule is established or a pitfall is discovered.

## Changelog

- **2026-07-01** — Mobile menu fix: scoped BG-shell `.arena-mobile-*` rules under `.arena-main`; restyled App-shell mobile menu to navy glass (was legacy gold), added `max-height` scroll and `aria-expanded` toggle state. Added tokens, shells, pitfalls, and QA sections to this document.
- **2026-06-23** — Design audit + color unification (see rules above; full findings in git history of this file).
