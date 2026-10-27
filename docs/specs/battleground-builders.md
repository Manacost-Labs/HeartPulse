# Battlegrounds builders

## Objective and acceptance

The strategy and tier-list builders use HearthPulse's parchment, burgundy and
brass controls. Their existing subscriber routes, live card pools, saved quick
slots, annotations and PNG/WebP exports remain available.

- Search and filters initially render at most 60 catalog cards; more cards are
  available explicitly. Searching does not rebuild unchanged tier rows.
- A card can move to any tier with a native control, including on touch devices
  and with a keyboard. Strategy cards fit all five columns without overlap.
- Local drafts survive reloads and navigation. Undo recovers an accidental edit
  or clear. Invalid or obsolete cards in drafts are ignored.
- On mobile, Library and Board buttons switch the visible panel and show the
  number of placed cards, without scrolling past the entire catalog. The board
  appears before quick slots and community slots. Switching brings the selected
  panel into view below the sticky controls.
- Guided tours retain all seven steps on mobile. While a tour is open, both
  editor panels are visible so discovery and highlighting work. Closing the tour
  restores the selected panel without changing the draft.
- Export reports unavailable images and never silently omits a placed card.
  Export feedback is separate from draft-save feedback.
- Both builders fill the available desktop workspace beside the site sidebar,
  including ultrawide screens. The strategy heading is «Конструктор стратегий БГ».
- Desktop library width is adjustable with a range, draggable divider or arrow
  keys. Width persists locally; narrow screens keep the tabbed layout. Library
  search, width and filter controls stay outside the independently scrolling
  catalog. No sticky overlay may obscure their touch targets.
- Strategy boards support 1–10 rows of five slots. Reducing rows preserves every
  card and repacks displaced slots; the minimum row count fits all placed cards.
  Rows and grid visibility participate in draft restoration and undo. The visible
  grid matches slot centers; exports retain the selected rows and grid.
- Workspace and export controls appear above the board. Mobile Board navigation
  brings the actual canvas into view below the sticky controls.
- Desktop and mobile views have no horizontal overflow, unreadable controls or
  editor errors. Unmounting stops the editor's global listeners and timers.

## Tier builder on VaryloUI (2026-10-21)

`/battlegrounds/tier-builder/` no longer runs the classic
`hero-tier-builder.js`. Its board is the vendored VaryloUI `gaming/tier-list`
(`src/features/BattlegroundTierBuilder.tsx`, a chunk of its own loaded by
`apps/public-web/ui/lazyBattlegrounds.tsx`), restyled through
`src/shared/ui/varyloParchment.css`. What it keeps:

- Data: the classic runtime `/bg-legacy/shared.js`, `tier-data.js` and
  `accessories-data.js` still loads the synchronized minion, trinket and hero
  pools with their bundled fallbacks; spells and English names come from the
  same `/api/battlegrounds-*` reads. Cards and filters live in
  `src/modules/battlegrounds/model/tierBuilder.ts`.
- Saving: the same browser draft `hearthpulse-tier-draft-v1`
  (`{ version: 1, draft: { POOL, S, A, B, C, D } }`), restored through
  `restoreTierPlacements`, saved 250 ms after a change and on unmount, with the
  same undo history and status texts. The export background choice keeps
  `hero-tier-builder-background-mode-v1`.
- Saved tier ids the current pool does not know stay in the stored draft, in
  their tiers, while other cards change: a trinket or spell source that failed
  or fell back for one visit hides its cards only until it recovers.
  «Все в пул» lets go of them too. Undo history entries are the draft read back
  against the pool, so undo after «Все в пул» returns to the earlier board.
- Export: «Скачать всё PNG/WebP» draws the same 2400 px image of every
  non-empty tier; VaryloUI adds copy as text and JSON download.

What changed: cards move by mouse drag, long press on touch, or the keyboard
(Space picks up, arrows move, Space drops, Escape cancels) instead of the
per-card tier select and arrow buttons. The pool is the last row of the tier
list; it shows 60 filtered cards with «Показать ещё» and scrolls inside, so
the tiers stay within reach while dragging. The per-tier PNG/WebP buttons, the
cards-per-row slider and the mobile Library/Board switch are gone; on a phone
the type, level and size filters start folded. The sidebar divider of the
classic workspace applies only to the strategy builder now.

## Implementation and ownership

New editor behavior belongs to `src/modules/battlegrounds`, exposed through its
`public.ts` and a versioned bridge to the two classic scripts in
`public/bg-legacy/`. `src/features/Battlegrounds.tsx` owns composition and the
static markup. Editor styles remain scoped to `.strategy-builder-page`; the
public content width is owned by `src/battlegrounds-shell.css`. No dependency,
API, permission, deployment infrastructure or subscription changes are required.

The separate [Manacost MCP](https://github.com/Manacost-Labs/mcp) owns server-side
PNG tools `render_battlegrounds_strategy` and `render_battlegrounds_tier_list`.
They resolve original cards from Koloda by ID, return native MCP image content
and do not write browser drafts or bypass this site's subscriber access rules.

Classic asset URLs remain stable. If a previously opened route loads a new
script without its versioned bridge, the script reloads the page before opening
an editor. Already saved local drafts survive that refresh. The refresh uses
the standard [Location.reload](https://developer.mozilla.org/en-US/docs/Web/API/Location/reload)
API; it does not request a browser-specific cache bypass.

Use typed contracts and native DOM controls, matching the existing
`legacy/heroRosterBridge.ts` install pattern. Escape card names and use
`textContent` for new labels. Tests belong in `tests/`, registered exactly once.

## Work and verification

1. Reproduce editor interaction and layout issues locally with bundled card data.
2. Add focused model tests, implement bounded catalog rendering and draft/undo
   lifecycle, then verify search, moves, reload and undo.
3. Apply the existing site palette and compact responsive layout; verify both
   builders in Chrome at desktop and mobile widths, including PNG/WebP export.

Commands: `npx tsx --test tests/battleground-builder-workbench.test.ts`,
`npm run test:registry`, `npm run lint`, `npm run lint:architecture`,
`npm run security:semgrep`, `npm run build:static`, `npm run build:next`,
`node --test tests/battleground-builders-browser.test.mjs`, `npm run test:storybook`,
`npm run build-storybook`.

## Draft contract

Drafts are local to this browser and versioned separately for each editor.
They are not account storage or publication. Only placement identities, slots,
row count, grid visibility, highlights and annotations are saved; no
credentials, paid statistics or library payloads are copied. Storage failures
keep the in-memory editor usable and must be communicated by the editor.

## Boundaries

Always validate restored placements against the current card pool and preserve
existing URLs and access checks. Production integration needs the owner's
explicit authorization. Never modify sibling worktrees or user sessions.

## Verification evidence (2026-10-11)

The shortened strategy heading and full-width shell are checked by
`tests/next-bg-builders-browser.test.mjs` at 3560, 1440, 390 and 320 pixels.
Chrome DevTools review confirms 3262 pixels of content in a 3302-pixel workspace
at 3560×1942, with no horizontal overflow in either editor or at 390×844.

The release suite exposed a flaky archetype-fixture click after the responsive
viewport checks. Its locator now waits for stable bounds before the same native
click, as specified by [Puppeteer's interaction contract](https://pptr.dev/guides/page-interactions).
No archetype product behavior or assertion is changed.

- Seven model tests cover row resizing, grid centers, bounded paging, history,
  valid tier identities, occupied
  slots and validated strategy drafts. Existing hero and accessory contracts pass.
- The built Next.js browser test uses the subscriber QA fixture at 1440×900 and
  390×844. It checks 60-card paging, row reuse while searching, native tier moves,
  reload restoration (including loading a new asset from an old route bundle),
  undo after clearing, double taps, keyboard movement,
  readable catalog names and bringing the mobile board into view,
  non-overlapping strategy cards and PNG/WebP signatures for both editors.
  Additional assertions cover divider dragging and keyboard resizing, safe row
  reduction, restoring row count and toggling the aligned grid.
  A target-size audit verifies that catalog scrolling does not obscure filters.
- The existing guest/subscriber browser contract still checks access boundaries,
  anonymous SEO and image exports. Subscriber interactions now use the visible
  mobile panel and native tier selector.
- Mobile browser tests open and dismiss both seven-step guided tours, preserving
  the selected panel. The full observatory also checks tour navigation and
  contrast, including the muted board hint and community-card counts.
- An unavailable-art fixture verifies that export reports failure, restores its
  button and does not download an incomplete board. Draft status cannot overwrite
  that error.
- TypeScript, architecture/catalog, test registry, documentation, static/Next.js
  builds, Storybook checks/build and selected-source Semgrep pass. Classic editor
  JavaScript is scanned explicitly because the standard changed-source wrapper
  excludes `public/`.
- React Doctor reports two existing host warnings: transition-all and function
  complexity. Both occur in unchanged code; no new diagnostic is attributed to
  workbench behavior.

Chrome DevTools MCP also reviewed both built routes with local bundled minion
art at desktop and mobile widths. Native tier selection, panel switching,
card placement, accessible control names and horizontal overflow were checked.
No editor exception or card-image request failure was observed. The subscriber
QA fixture deliberately requests a missing avatar, and the host emits an existing
unused CSS-preload warning; these are outside the editor changes. An unthrottled
local tier-builder trace measured LCP 229 ms and CLS 0.01; these are laboratory
observations, not real-user guarantees.

Browser checks use isolated local sessions and test catalog responses. They do
not prove production API availability or real-user performance. Production
integration and deployment follow the owner authorization and immutable release
contracts in `DEPLOYMENT.md`. A failed release uses the existing previous-release
rollback; browser drafts and shared server data are preserved.
