# HearthPulse card motion and hero statistics

## Objective

Keep the existing parchment, wood and gold visual language while making cards
consistent, hover previews calm and hero statistics easier to scan. Public URLs,
API payloads and subscription permissions stay unchanged.

## Acceptance criteria

- Arena tier cards reserve the same image box for every source and fallback;
  images retain their proportions. Hover does not crowd neighbouring cards.
- Arena class rankings remain readable throughout a short bar transition.
  Rows do not jump or enter in a long staggered sequence.
- Hero powers fade in on hover and keyboard focus, remain hoverable, and can be
  dismissed with Escape. Touch navigation still opens the hero details.
- Normal and golden buddies are adjacent, labelled and equally sized. The hero
  power occupies its own row when three columns cannot fit comfortably.
- Hero summary metrics remain visible. Four labelled tabs expose Overview,
  Hero power, Tavern and Compositions, with one statistics panel at a time.
  Data is retained, including tables, empty states and the existing gallery.
  A section with no source rows shows an explicit empty message, not a blank tab.
- Tabs support arrow keys, Home/End and a visible focus indicator. Page-tour
  targets remain discoverable. Reduced-motion users receive static end states.
- No horizontal page overflow at 320, 390, 768, 1280 and 1440 CSS pixels.

## Implementation and boundaries

Arena ownership is `DeferredRoutes.tsx` and its route styles. Hero composition
stays in `Battlegrounds.tsx`; focused presentation components own the hero card
and statistics tabs. Components accept typed props, use native buttons/links
and keep state local, for example `setActiveTab('power')`.

Use the existing React/Vite stack and CSS, without new dependencies. Do not
change APIs, authentication, source data, databases or unrelated worktrees.
Avoid adding logic to ratcheted monolithic files: extract presentation first.

## Plan and verification

1. Add regression checks against the existing layout and interaction contract.
2. Deliver Arena sizing/motion as a separate tested commit.
3. Deliver hero hover, buddy layout and statistics navigation in tested slices.
4. Run `npm run lint`, focused browser tests, `npm run test:storybook`,
   `npm run security:semgrep`, `npm run verify:release` and `npm run qa:ci`.
5. Inspect desktop/mobile states in Chrome DevTools and local Storybook.
6. Complete independent Sol review, integrate the current remote main, run
   `npm run agent:integration:preflight`, push main and deploy the reviewed SHA.
7. Verify release identity, live route/assets and rollback availability before
   reporting production completion and posting the public changelog.

Miro MCP is unavailable in this session; the explicit user brief and existing
project design are the design reference. Production content requires a
subscription in a clean browser: local deterministic fixtures validate private
UI, while live anonymous checks cannot prove a subscriber session.

Documentation impact: this contract, the Arena slice contract and CHANGELOG.
The project mandates more skills than the global normal-task budget; instructions
are loaded by phase. The generic increment skill's optional definition-of-done
reference is absent in its installed folder; the repository release gates apply.
