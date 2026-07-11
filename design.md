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

HS-Arena is a Hearthstone statistics product presented as a readable game compendium. The interface uses real Hearthstone materials without copying the game client: continuous parchment for content, a red textured navigation rail, wood for separators and frames, and one restrained accent per game mode.

The design must feel authored and useful, not like a collection of unrelated rounded dashboard cards.

Primary goals:

- One continuous page canvas and one predictable content width across routes.
- Data remains fast to scan during a draft or Battlegrounds game.
- Real card, class and hero assets carry most of the visual energy.
- Decorative assets frame information; they never reduce legibility or steal interaction space.
- Existing filters, lightboxes, tier grids, drag/drop builders, exports and media behavior remain intact during visual passes.

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

### Page Width

- Standard data and editorial pages: one open parchment surface, `max-width` around `1280–1320px`.
- Builders use the full width left after the `252px` desktop rail. Their decorative BG frame is `20–28px` with only `8–12px` inner breathing room; never spend the same wide inset twice as both border and padding.
- Do not create route-specific narrow wrappers without a content reason.
- Do not restore the old independent rounded parchment block around every page.

### Responsive Rules

- App shell switches at `1024px`; compact layout must be verified at `390px`.
- No horizontal page scrolling at `390px`.
- Touch targets are at least `42px`, preferably `46px`.
- Long filter rows wrap or scroll locally; they never widen the document.
- Hover-only information must not be required to use the site.

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
- Navigation structure is approved; visual changes must not rename or reorder routes unless requested.

## Home Page

- The home page is a utility dashboard, not a promotional landing page. Start with live freshness, the current Arena leader, data-source count and direct actions; avoid oversized slogans, quotes and repeated explanatory copy.
- Keep the first viewport compact enough to expose the beginning of the product directories on a typical laptop. The live class summary reads as a small tavern scoreboard, not a decorative orbit.
- The first screen uses `/wallpaper/home-paladin-hero.webp` as a masked character mural behind the live Arena scoreboard. Keep the face and hammer visible, bias the desktop crop slightly left, preserve the red text field, and never place essential copy directly over the artwork. On narrow screens the mural becomes a short panorama between actions and live rankings.
- Do not repeat freshness, source count and leader data in a separate footer strip inside the hero; the label and live ranking already communicate that context, so the wood frame should close directly below the main composition.
- Mode discovery follows a fixed order: **Battlegrounds directory**, **Arena directory**, then cross-mode statistics. Each directory links directly to the work users can perform in that mode.
- The statistics section may combine Arena rankings with a Battlegrounds spotlight, but every value and chart point must come from the existing APIs. Never invent demo metrics; show an honest updating state if a source is unavailable.
- The Battlegrounds hero spotlight uses the actual eight-place distribution as a compact line/area chart, includes hero identity and hero-power context, and links to the full hero directory.
- Use the canonical wood frame for the hero spotlight and major directory boundaries. Internal rows stay quiet and readable; do not add generic colored side rails or a grid of white dashboard cards.
- On mobile, directories stack before statistics, graph labels remain legible, and the page never gains document-level horizontal scrolling.

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
- Related-card and hero-power reveals are protected interactions.
- Hero details use a clear three-level asset hierarchy: the identity dossier uses the full `/wallpaper/main-page-rail-border.png`, primary ledger sections use its thin border slice, and hero-power/companion cards use `/wallpaper/deck-border.png`. Do not frame every chart row or minor statistic.
- The identity dossier uses dark aubergine/walnut surfaces with cream copy and gold metadata; cold white and blue cards are not valid inside this hierarchy.
- Long hero, hero-power and companion names use balanced wrapping with `overflow-wrap`; descriptions remain fully readable and are never line-clamped merely to equalize card heights.
- Hero detail charts may use violet-to-gold data bars; chart meaning must remain distinguishable.
- Gallery, soundboard and hero-power media lightboxes keep keyboard and close behavior.

### Library, Creatures And Spells

- Section switcher, pool state and filters share parchment controls with violet active states.
- Card names sit on small parchment captions; card images remain visually unboxed.
- Golden card reveal is protected: base card moves left and golden layer appears to the right on pointer hover/focus.
- Do not change golden image fallback order, `opacity`, `translate` or event behavior while restyling.
- Detail pages retain statistics, round charts, wiki links, similar cards and strategy links.
- Card detail pages use the canonical timber rail around the identity dossier and thin timber slices around major statistic/related-content ledgers. Their inner fields are honey parchment, never cold white; long card names, group labels, source labels and metric values must wrap inside `min-width: 0` containers.
- Archive pagination uses the same active violet treatment as the current pool switcher.

### BG Tier List

- Top list switcher uses walnut/burgundy idle cards, cream labels and a violet/gold selected state. Cold white or blue navigation cards are not part of the BG palette.
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
- Arena modal panels use deep red/wood. BG strategy and card viewers use the canonical timber rail over red tavern cloth with cream/gold copy; plain black modal panels are not valid.
- Stats rows are compact, high contrast and use metric color only for meaning.
- Card art has no extra fake frame unless the canonical asset supplies it.
- Mobile order is art first, stats second; both are compacted to the viewport instead of adding modal scrolling.
- Arena card lightboxes must fit the complete card and all statistic rows inside `100dvh`; the modal shell itself must not require scrolling.
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

- **2026-07-10** — Wide BG workbench and contrast pass: reclaimed ornamental-frame space, expanded both builders, made annotation tools container-responsive, replaced cold tier-list whites/blues with walnut, aubergine and honey parchment, and corrected the profile plaque/art/avatar composition.
- **2026-07-10** — Battlegrounds parchment system: added a scoped BG shell, local bartender title sign, violet/gold controls, parchment library and hero surfaces, wiki skin builder frame, warm builder variables, protected golden-card and hero animations, and expanded route-specific QA rules.
- **2026-07-10** — Unified site direction: continuous parchment page canvas, red textured menu, thicker wooden separators and Hearthstone profile frame.
- **2026-07-02** — Repository and asset hygiene, deferred route work and screenshot QA.
- **2026-07-01** — App/BG mobile shell scoping fix.
