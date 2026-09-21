# Profile workspace design

## Objective

The account page should feel like part of HearthPulse and make account status,
subscription access and editable contacts easy to understand. The working scope
is the personal account opened with `?login`; public profile data stays public-only.

## Acceptance criteria

- The entire account surface uses the site's parchment palette, including
  the space around panels. No opaque white sheet appears behind the profile.
- Identity, subscription access, contacts and participation history have clear
  headings and distinct groups. The main action is clear within each group.
- Status and verification messages describe real API state. Contact fields,
  saving, refresh, public-profile links and sign-out remain operable.
- At 390 and 1440 px, text and controls remain visible without horizontal
  overflow. Keyboard focus and form feedback remain accessible.

## Implementation plan

1. Reproduce the current account using local fixtures and identify the owning
   surface styles. Verify active, inactive and failed subscription checks.
2. Correct the background and simplify panel hierarchy using existing assets,
   typography and reusable identity presentation.
3. Verify contact saving and subscription refresh in Storybook and a real
   browser, then run the project's build and release checks.

## Files and conventions

Account rendering currently lives in `src/features/DeferredRoutes.tsx`.
`src/components/ProfileIdentityHero.tsx` owns identity presentation. New visual
rules belong with their owning component; use existing `profile-*` classes,
semantic sections and visible labels rather than inline styles or new deps.
Keep existing account and subscription API contracts and privacy boundaries.

`src/features/ProfileAccessSummary.tsx` presents the existing access state and
last verification time. An active subscription initially collapses the native
setup disclosure; unconfirmed access opens it. The account surface is styled
independently of the previous tab, and promotional overlays are hidden there.
The bottom account actions contain sign-out only, including for administrators;
the former Standard meta and article-management shortcuts are removed.

## Verification

Run `npm run lint`, `npm run security:semgrep`, `npm run test:storybook`,
`npm run build-storybook`, `npm run build`, `npm run budget`, and
`npm run lint:docs`. Run `node --test tests/field-focus-browser.test.mjs`
for field and account regressions. Use Chrome DevTools MCP for desktop/mobile layout,
keyboard behavior, accessibility structure, console and failed requests.
Fixtures must use synthetic account data and intercept their API calls.

## Documentation impact

Update this spec and `CHANGELOG.md` with the final visible behavior. If UI
ownership changes, update the architecture catalog in the same task.
