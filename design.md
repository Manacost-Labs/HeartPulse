---
name: HS-Arena Design System
colors:
  primary: "#8d171d"
  on-primary: "#fff0c8"
  secondary: "#8f536d"
  on-secondary: "#fff0c8"
  background: "#ead6a7"
  on-background: "#30251c"
  parchment: "#ead6a7"
  parchment-light: "#f7e8bf"
  ink: "#30251c"
  ink-muted: "#735e49"
  wood: "#2e160b"
  wood-soft: "#5f371d"
  arena-red: "#8d171d"
  arena-red-dark: "#5d0d13"
  battlegrounds-violet: "#8f536d"
  battlegrounds-violet-dark: "#3d2335"
  battlegrounds-violet-deep: "#2a1725"
  accent-gold: "#d9ab49"
  accent-gold-bright: "#efc96f"
  positive: "#2f7a3e"
  negative: "#a33a3a"
typography:
  display:
    fontFamily: HSDisplay
    fontSize: 32px
    fontWeight: "700"
    lineHeight: 38px
    letterSpacing: 0em
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: "400"
    lineHeight: 24px
    letterSpacing: 0em
rounded:
  sm: 4px
  DEFAULT: 6px
  md: 8px
  lg: 12px
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 16px
  margin: 24px
---

# HS-Arena Design System

> This is the visual source of truth for `arena.hs-manacost.ru`. Read it before changing UI. Preserve product behavior, data loading and protected animations unless a task explicitly asks for functional changes.

## Product Direction

HS-Arena is a Hearthstone statistics product presented as a readable game compendium. The interface uses real Hearthstone materials without copying the game client: continuous parchment for content, a red textured navigation rail, wood for separators and frames, and one restrained accent per game mode. Cold white, milk-white and blue-white page backgrounds are never valid: every exposed page surface must be parchment, wood, red tavern cloth or the assigned game-mode material.

The design must feel authored and useful, not like a collection of unrelated rounded dashboard cards.

Primary goals:

- One continuous page canvas and one predictable content width across routes.
- Data remains fast to scan during a draft or Battlegrounds game.
- Real card, class and hero assets carry most of the visual energy.
- Decorative assets frame information; they never reduce legibility or steal interaction space.
- Existing filters, lightboxes, tier grids, drag/drop builders, exports and media behavior remain intact during visual passes.
- Deck-builder pages keep parchment only on the outer page canvas. Their framed work surface is red tavern cloth, and class choices use real crests inside profile-like deck frames rather than light dashboard cards.

## Material And Color Tokens

| Role | Value | Usage |
|---|---|---|
| Parchment | `#ead6a7`, `#f7e8bf` | page canvas, quiet panels |
| Ink | `#30251c` | primary text |
| Muted ink | `#735e49` | descriptions and metadata |
| Wood | `#2e160b`, `#5f371d` | rules, frames, depth |
| Arena red | `#8d171d`, `#5d0d13` | Arena headings and active controls |
| BG violet | `#8f536d`, `#3d2335`, `#2a1725` | Battlegrounds headings, active controls, builders |
| Gold | `#d9ab49`, `#efc96f` | icons, tiny highlights, selected details |
| Positive data | `#2f7a3e` | good metrics only |
| Negative data | `#a33a3a` | bad metrics and errors only |

Gold is not a general panel fill. Use it for small accents, asset-native details and important selected states. Large surfaces stay parchment, red, violet or dark wood.

### Typography

| Token | Value | Usage |
|---|---|---|
| `--font-display` / `--font-hs` | `HSDisplay`, fallback serif | brand, headings, menu links, tier labels |
| `--font-body` | `Inter`, sans-serif | descriptions, filters, tables, metadata |

- Display type is expressive; body copy stays plain and compact.
- Uppercase is limited to kickers and small section labels.
- Long labels must use `min-width: 0` and wrap or truncate intentionally.

## Canonical Assets

| Asset | Purpose |
|---|---|
| `/wallpaper/arena-parchment.jpg` | continuous page material |
| `/wallpaper/arena-rail-red.jpg` | fixed red navigation rail |
| `/wallpaper/main-page-rail-border.png` | major Arena and Battlegrounds wooden frame |
| `/wallpaper/deck-border.png` | compact dark frame for short profile statuses and BG hero media cards |
| `/wallpaper/wiki-battlegrounds-skin.webp` | Battlegrounds outer frame |
| `/wallpaper/battlegrounds-bartender-header.webp` | Battlegrounds title sign |

Do not hotlink these assets from wiki.gg in runtime CSS. Keep optimized local copies in `public/`.

## Layout Architecture

The app has two navigation contexts that share historical class names:

1. **App shell** in `src/App.tsx`: desktop fixed sidebar at `1024px+`; mobile sticky topbar and fixed drawer below it.
2. **Legacy/tab shell** in deferred components: any `.arena-mobile-*` rule for this shell must stay scoped below `.arena-main`.

Never add an unscoped duplicate `.arena-mobile-*` rule. The App drawer must remain `position: fixed`; an inline dropdown may use `position: absolute` only inside a positioned parent.

The public shell groups secondary destinations instead of filling the rail with parallel links. **Конструкторы** contains the strategy and tier-list builders; **Разное** is the final navigation group and contains Gallery, Guides Archive and Contests. Groups open on hover, focus or click on desktop and by tap on mobile, with only one group expanded at a time.

### Page Width

- Standard data and editorial pages: one open parchment surface, `max-width` around `1280–1320px`.
- Builders use the full width left after the `252px` desktop rail. Their decorative BG frame is `20–28px` with only `8–12px` inner breathing room; never spend the same wide inset twice as both border and padding.
- Do not create route-specific narrow wrappers without a content reason.
- Do not restore the old independent rounded parchment block around every page.

### Responsive Rules

- App shell switches at `1024px`; compact layout must be verified at `390px`.
- On mobile Arena data routes, only the route root paints the parchment texture; workspace, main and open content stay transparent to avoid stacked iOS compositing and dark rectangular bands.
- No horizontal page scrolling at `390px`.
- Touch targets are at least `42px`, preferably `46px`.
- Long filter rows wrap or scroll locally; they never widen the document.
- Hover-only information must not be required to use the site.
- A locked subscription route is a single access panel on mobile; never leave a dimmed, scrollable data preview behind it.
- Mobile profile badges use their real container width and a normal grid. Negative margins or calculated over-width hacks are not valid.

## Shared Surface Language

- Parchment is a material, not a flat beige color. Use the local texture plus a translucent gradient for readability.
- Wood separators are thin (`4–6px`) and appear at major section boundaries.
- Most content sections are nearly square (`4–8px` radius), with a quiet neutral border.
- Do not use colored vertical inset rails or left-border accent strips on BG content panels, cards or directory entries. They read as generic dashboard decoration rather than Hearthstone material.
- Separate major BG regions with the canonical wooden frame assets or a horizontal wooden rule; use spacing and quiet neutral borders inside those regions.
- Avoid a grid of identical large rounded cards. Use grouping, rules, typography and spacing first.
- Shadows are warm, soft and sparse. No dirty gray halos behind raw card art.
- Card art, hero portraits, mana gems and rarity assets are never recolored by CSS filters.

## Navigation

- Desktop rail uses red texture, gold icons and expressive cream text.
- Active link uses a darker red field plus a gold left rule; it must stay readable without glow.
- Profile badge stays in the Hearthstone deck frame.
- Mobile uses the same red material, a compact brand and a burger/X button with `aria-expanded`.
- Opening the mobile drawer locks the document at its current scroll position; the login entry uses a compact inset-gold border rather than an oversized card-art frame.
- Navigation structure is approved; visual changes must not rename or reorder routes unless requested.
- The public footer is global to `.arena-app-shell`: every route uses the same red tavern cloth, wooden top rule, cream links and muted gold legal copy. Route-specific footer skins are not valid.

## Home Page

- The home page is a utility dashboard, not a promotional landing page. Start with live freshness, the current Arena leader, data-source count and direct actions; avoid oversized slogans, quotes and repeated explanatory copy.
- Keep the first viewport compact enough to expose the beginning of the product directories on a typical laptop. The live class summary reads as a small tavern scoreboard, not a decorative orbit.
- The first screen uses `/wallpaper/home-paladin-hero.webp` as a masked character mural behind the live Arena scoreboard. Keep the face and hammer clearly visible beside the class board with a left-biased desktop composition, preserve the red text field, and never place essential copy directly over the artwork. On narrow screens the mural becomes a short panorama between actions and live rankings.
- Do not repeat freshness, source count and leader data in a separate footer strip inside the hero; the label and live ranking already communicate that context, so the wood frame should close directly below the main composition.
- After the quick index, show **Latest articles** first, then the **Battlegrounds directory**, then the **Arena directory**. Each directory links directly to the work users can perform in that mode.
- Do not restore the removed home “Мета в цифрах” aggregate: class leaders, best cards and legendary groups already have dedicated pages and made the home unnecessarily long.
- Use the canonical wood frame for the hero spotlight and major directory boundaries. Internal rows stay quiet and readable; do not add generic colored side rails or a grid of white dashboard cards.
- On mobile, directories stack before articles and community content, and the page never gains document-level horizontal scrolling.

## Profile

- The profile header is a wood-framed red reliquary with the local tavern artwork visible through a dark red readability veil.
- Its route plaque always reads `Профиль`, independent of the previously open game mode. The profile route must not inherit `arena-app-battlegrounds` or another stale surface class.
- Align the local tavern artwork to the top edge on desktop so the bartender's face remains visible; balance the left column with a centered `96–110px` avatar instead of adding unrelated filler decoration.
- Statuses may use the horizontal `/wallpaper/deck-border.png` asset because their short labels fit its proportions.
- Settings and subscription panels use the larger wooden rail frame; form controls themselves stay plain parchment for readability.
- Subscription sources and winner entries may use the smaller deck frame, but ordinary rows remain unframed so the page does not become visually noisy.
- Profile decoration never changes authentication, subscription checks, contest history or form behavior.

## Arena Pages

- Arena uses red as its mode accent.
- Main titles and important summaries may sit inside a red framed panel.
- Filters remain parchment with red selected states.
- Tier grid, source switching, card preview, lightbox and export behavior are protected.

## Battlegrounds Pages

Battlegrounds uses the shared parchment canvas with dusty violet as the mode accent.

The root hook is `.arena-app-battlegrounds`. Route roots use:

- `.bg-heroes-page`
- `.bg-hero-detail-page`
- `.bg-library-page`
- `.bg-library-detail-page`
- `.bg-tier-list-page`
- `.bg-builder-page`

BG-specific styles live in `src/battlegrounds-parchment.css` and must stay scoped below `.arena-app-battlegrounds`.

### Heroes

- Hero tiles use a quiet parchment field so portraits stay dominant.
- Average placement and pick rate have separate, readable treatments.
- Search and tier counts are compact.
- The heroes introduction keeps one wooden divider below the title, then combines metric guidance and search in one quiet parchment tool panel without decorative bottom rails.
- Related-card and hero-power reveals are protected interactions.
- Hero details use a clear three-level asset hierarchy: the identity dossier uses the full `/wallpaper/main-page-rail-border.png`, primary ledger sections use its thin border slice, and hero-power/companion cards use `/wallpaper/deck-border.png`. Do not frame every chart row or minor statistic.
- The identity dossier uses dark aubergine/walnut surfaces with cream copy and gold metadata; cold white and blue cards are not valid inside this hierarchy.
- Long hero, hero-power and companion names use balanced wrapping with `overflow-wrap`; descriptions remain fully readable and are never line-clamped merely to equalize card heights.
- Hero detail charts may use violet-to-gold data bars; chart meaning must remain distinguishable.
- Gallery, soundboard and hero-power media lightboxes keep keyboard and close behavior.

### Library, Creatures And Spells

- Section switcher, pool state and filters share parchment controls with violet active states.
- The library directory and filters form one tavern catalogue: `main-page-rail-border.png` supplies the timber frame, `arena-rail-red.jpg` supplies the restrained red cloth, and parchment remains the reading surface. Avoid stacked white dashboard cards and repeated loose bottom rails.
- Library mechanic labels are normalized before rendering: `BACON_REFRESH_TOOLTIP` → `В следующих обновлениях`, `BACON_BLOOD_GEM_TOOLTIP` → `Кровавые самоцветы`, and `IMMUNE` → `Неуязвимость`; `BACON_PASS_TOOLTIP` and `SECRET` are hidden from filters and card metadata.
- Card names sit on small parchment captions; card images remain visually unboxed.
- Golden card reveal is protected: base card moves left and golden layer appears to the right on pointer hover/focus.
- Do not change golden image fallback order, `opacity`, `translate` or event behavior while restyling.
- Detail pages retain statistics, round charts, wiki links, similar cards and strategy links.
- Card detail pages use the canonical timber rail around the identity dossier and thin timber slices around major statistic/related-content ledgers. Their inner fields are honey parchment, never cold white; long card names, group labels, source labels and metric values must wrap inside `min-width: 0` containers.
- Archive pagination uses the same active violet treatment as the current pool switcher.

### BG Tier List

- Top list switcher uses walnut/burgundy idle cards, cream labels and a violet/gold selected state. Cold white or blue navigation cards are not part of the BG palette.
- Tier navigation cards and the active tier ledger use the canonical timber border asset. The active accent is `#4A2F66`; use it selectively for selected controls, focus/highlight states and title plaques, never as a page-wide background.
- `public/wallpaper/main-page-header.svg` is the locally stored Hearthstone Wiki heading ornament (source: `https://hearthstone.wiki.gg/images/b/b2/Main_page_header.svg`) and may be used as a mask behind short headings. Preserve generous inner padding and never place body copy inside it.
- The tier index is a dark wood/aubergine ledger. Rank groups and individual entries use deeper honey parchment, while nested filters use dark wells with violet/gold chips; avoid the former white/blue dashboard controls.
- Every rank entry has an explicit themed hook; styling must not depend on `:last-child`, visible limits or whether a “show more” control is present.
- Tier card click/lightbox behavior and URL state are protected.
- Raw card images remain large enough to recognize and are not filtered.

### Builders

- Strategy and tier builders sit inside `/wallpaper/wiki-battlegrounds-skin.webp`.
- The work canvas stays dark for drag/drop contrast, using aubergine, brown, muted gold and parchment text.
- On wide screens, reserve roughly `32%` for the searchable library and the remaining width for the canvas/tier rows. The canvas must stay at least `620px` high and should read as a broad workbench rather than a narrow portrait column.
- Annotation tools respond to the canvas container: below `860px` of canvas width they move into a wrapped horizontal rail below the board, freeing the full board width.
- Restyle through CSS variables and wrapper surfaces first.
- Do not edit legacy drag/drop, compression, export, canvas or ordering JavaScript during a design-only task.
- Verify card library mount, drag/drop target, PNG/WebP buttons and mobile overflow after every pass.

## Lightboxes And Hover Details

- Backdrops are dark and lightly blurred.
- Every content lightbox—Arena cards, deck cards, BG strategies, BG hero media and gallery art—uses the canonical timber rail over red tavern cloth with cream/gold copy. Plain white, transparent and black modal panels are not valid; a dark wine inner art stage is allowed when it improves artwork contrast.
- Stats rows are compact, high contrast and use metric color only for meaning.
- Card art has no extra fake frame unless the canonical asset supplies it.
- Mobile order is art first, stats second; both are compacted to the viewport instead of adding modal scrolling.
- Arena card lightboxes must fit the complete card and all statistic rows inside `100dvh`; the modal shell itself must not require scrolling.
- Every drawer and content lightbox locks both the root document and the iOS body at the current scroll position, then restores that exact position on close. Only the modal panel may scroll locally.
- Hover tooltip stays `pointer-events: none` and never becomes the only source of information.

## Motion And Protected Interactions

Protected behavior includes:

- Arena card hover and lightbox transitions.
- Battlegrounds related-card and hero-power reveals.
- Golden card base/golden two-layer animation.
- Builder drag/drop, canvas placement and export.

Rules:

- Prefer `opacity`, `translate`, `transform` and background-position.
- Do not add permanent `will-change` to repeated cards.
- Honor `prefers-reduced-motion` by shortening transitions, not by breaking state changes.
- A visual pass should add semantic root hooks rather than rewriting component state.

## Accessibility

- Active filter buttons expose `aria-pressed` where appropriate.
- Focus-visible states must be at least as clear as hover states.
- Color is never the only signal for a metric or selected control.
- Decorative title frames do not replace real headings in the DOM.
- Images keep meaningful `alt` text; decorative icons use empty alt or `aria-hidden`.

## Performance

- Reuse local compressed textures; do not add large remote runtime backgrounds.
- Keep route-heavy BG code deferred.
- Avoid `content-visibility: auto` on visible grids; it breaks full-page and mobile paint.
- Do not add JS for effects achievable in CSS.
- Run `npm run budget` when changing bundles or adding assets.

## Primary Files

- `STABILIZATION.md` — measurable reliability baseline, route/access inventory, SLOs and Definition of Done.
- `assets.md` — portable design guide and the complete production-URL asset catalogue for integrations.
- `src/App.tsx` — shell state and route-level root classes.
- `src/index.css` — base shell and navigation.
- `src/parchment-theme.css` — shared Arena/editorial parchment system.
- `src/battlegrounds-parchment.css` — scoped Battlegrounds skin.
- `src/features/Battlegrounds.css` — protected BG interaction animations.
- `src/features/Battlegrounds.tsx` — hero, tier and builder routes.
- `src/features/BgLibrary.tsx` — library, creature/spell lists and detail pages.
- `public/bg-legacy/strategy-builder.gridfix2.css` — legacy builder presentation only.

## QA Checklist

1. `npm run lint`.
2. `npm run build`; if existing `dist/` ownership blocks a local agent, build to a clean temporary outDir and report the infrastructure limitation.
3. Desktop screenshot at `1440px` and mobile screenshot at `390px` for every changed route family.
4. Confirm `document.documentElement.scrollWidth === innerWidth` at `390px`.
5. Heroes: search filters results; hero hover still changes the media layer; detail media opens/closes.
6. Library: filters work; card navigation works; golden hover layer reaches visible opacity and translates independently.
7. BG tier list: list/source/filter state and lightbox still work.
8. Builders: mount contains cards, drag/drop target exists, PNG/WebP buttons exist, no document overflow.
9. Inspect console errors; mocked API failures used for fallback QA are expected and must be identified as such.
10. Never deploy during a GitHub-only task. Push the feature branch and update the existing PR.

## Known Pitfalls

1. Unscoped `.arena-mobile-menu` rules previously placed the App drawer thousands of pixels below the viewport.
2. Global text-color overrides can make tier letters and metric pills unreadable; components with colored backgrounds own their foreground.
3. CSS filters damage mana, rarity and card assets.
4. Broad surface selectors must stay below route root hooks.
5. Existing `dist/` may be owned by the production user; do not delete or replace it unless deployment is explicitly requested.
6. `Design.md` exists as a compatibility pointer. Update its summary when the canonical direction in `design.md` changes materially.

## Changelog

- **2026-07-11** — Added `assets.md` with portable visual rules, integration-ready CSS recipes and verified production URLs for every public visual asset.
- **2026-07-11** — Contained mobile section-banner pseudo-elements within their timber header; they previously resolved `inset: 0` against the full content canvas and shaded every Arena route.
- **2026-07-11** — Removed route-level opacity as a page-visibility dependency after iOS WebKit could miss the animation frame and leave Arena content at 72% opacity.
- **2026-07-11** — Removed stacked mobile Arena parchment layers and the full-list source-loading tint that produced the remaining iOS dimmed-content state.
- **2026-07-11** — Hardened the Arena legendary data path against empty upstream and persisted caches, preserving the latest non-empty scraper snapshot and rotating the client cache after recovery.
- **2026-07-11** — Grouped both Battlegrounds builders under “Конструкторы” and Gallery, Guides Archive and Contests under the final “Разное” menu, with desktop hover/focus and mobile tap behavior.
- **2026-07-11** — Applied the canonical timber-and-red-cloth subscription gate to all Battlegrounds routes, replacing the last white-and-blue paywall variant.
- **2026-07-11** — Removed the misleading partially dimmed mobile subscription preview, stabilized profile badges and long BG copy, simplified the mobile login frame, and added shared iOS-safe background scroll locking to drawers and all content lightboxes.
- **2026-07-11** — Shifted the home hero character left on desktop to align his torso with the intended central focal point while preserving the mobile composition.
- **2026-07-11** — Added timber frames to BG tier navigation and the tier ledger, introduced the restrained `#4A2F66` active accent, and added the local Hearthstone heading ornament.
- **2026-07-11** — Rebuilt the BG library directory and filters as a timber-framed tavern catalogue with red cloth, parchment controls and asset-backed search framing.
- **2026-07-11** — Localized the remaining BG mechanic labels and removed the pass/secret placeholder mechanics from the library UI.
- **2026-07-11** — Moved Latest articles above the Battlegrounds and Arena directories on the home page.
- **2026-07-11** — Applied the canonical tavern footer to every public route, including all Battlegrounds pages.
- **2026-07-11** — Simplified the BG heroes controls into one rail-free metric and search panel.
- **2026-07-10** — Wide BG workbench and contrast pass: reclaimed ornamental-frame space, expanded both builders, made annotation tools container-responsive, replaced cold tier-list whites/blues with walnut, aubergine and honey parchment, and corrected the profile plaque/art/avatar composition.
- **2026-07-10** — Battlegrounds parchment system: added a scoped BG shell, local bartender title sign, violet/gold controls, parchment library and hero surfaces, wiki skin builder frame, warm builder variables, protected golden-card and hero animations, and expanded route-specific QA rules.
- **2026-07-10** — Unified site direction: continuous parchment page canvas, red textured menu, thicker wooden separators and Hearthstone profile frame.
- **2026-07-02** — Repository and asset hygiene, deferred route work and screenshot QA.
- **2026-07-01** — App/BG mobile shell scoping fix.
