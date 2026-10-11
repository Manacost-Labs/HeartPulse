# Compact Battlegrounds library controls

## Scope

Keep the HearthPulse parchment palette and game typography, but make the card
catalog the main content. One compact toolbar replaces separate framed panels.
Search, tavern tiers and minion types stay visible. Duo, mechanics and groups
are under a native disclosure. Selected filters can be removed individually or
reset together; reset keeps the chosen catalog section and pool.

## Acceptance

- All existing sections and current/archive routes remain available.
- Search has an accessible label; selection buttons expose `aria-pressed`.
- Hidden advanced selections remain visible in the active-filter summary.
- Empty results offer reset. Keyboard and narrow screens work without overflow.
- Aberrations are classified from upstream race data, never inferred from names
  or rules text. The importer, API vocabulary and stored rows must agree.

## Implementation and checks

The Battlegrounds client module owns controls; the legacy page composes them
with existing catalog state. Tests live under `tests/`; Storybook supplies
isolated interactions with fixture data. Run `npm run lint`,
`npm run lint:next`, `npm run test:storybook`, `npm run build-storybook`,
`npm run security:semgrep`, and the focused library tests/browser checks.
No new dependencies, authentication changes, paid requests or deployment.

Documentation impact: this spec, `CHANGELOG.md`, and module ownership notes in
`docs/architecture/module-boundaries.md`.
