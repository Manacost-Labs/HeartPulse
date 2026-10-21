# Valyro UI Pro (vendored)

Source copied from the Valyro Pro registry (`/home/debian/valyro-pro-registry`,
`<name>.json`; the release with the CLI is `/home/debian/valyro-ui-release`).
There is no `valyro-ui-pro` npm package, so items are vendored here the same
way as `src/vendor/varylo-ui`. Each file keeps its registry path.

Items: `sankey-chart` and its registry dependencies (`styles`, `theme`,
`primitives`, `icons`, `skeleton`). Valyro files differ from the VaryloUI
copies of the same names, so the two kits stay in separate directories.

Local changes:

- `styles/index.css` imports only the shared tokens, base and motion styles;
  `styles/themes/*.css` and `styles/tailwind.css` are not shipped. Consumers
  map the `--ui-*` tokens in their own scope: the patch notes flow uses
  `src/shared/ui/varyloParchment.css` plus the Sankey tokens in
  `src/features/patchNotes/PatchNotesShowcase.css` (`.hp-patch-flow`).
- `charts/SankeyChart.tsx`/`.css`: `onNodeClick` (click, or Enter on the
  keyboard-picked node; on touch the first tap only shows the tooltip).
- `primitives/react-compat.ts` and `theme/createThemeCSS.ts`: typed for the
  project's `strict: false`, where two conditionals do not narrow.

Each change is introduced by a `HearthPulse` comment. Do not edit other files
by hand; re-copy them from the registry instead, and carry these changes over
when updating the changed ones. Oxlint, React Doctor and the CSS `:root` rule
skip this directory; its inherited non-null assertions are budgeted in
`config/source-debt-budgets.json`.

Also vendored for the archetype page: `metric-comparison` and `combobox`
with their registry dependencies (`theme`, `primitives`, `icons`, `badge`,
`spinner`). The archetype page does not import `valyro-ui/styles`: it uses
`src/vendor/varylo-ui/styles/index.css` and maps the tokens in
`src/features/archetypeVaryloTheme.css`, so a second copy of the base classes
never lands in its CSS chunk.

Also vendored for site-wide transitions (free ValyroUI release
`/home/debian/valyro-ui-release`, `r/page-transition.json`): `motion-kit/`
(`PageTransition`, the preset engine `page-transitions.ts` with the ten free
presets, `preference.ts`, `profile.ts`, `render-tier.ts`). `primitives/utils.ts`
was re-copied from that release because `PageTransition` needs its
`isMotionReduced`; the rest of `primitives` is unchanged. Not vendored:
`motion-kit/view-transition.ts` (public pages navigate inside one document
without View Transitions, see `docs/specs/public-client-navigation.md`) and the
thirty Pro presets (`page-transitions-pro`, licensed; the site uses only free
presets). Local changes:

- `motion-kit/PageTransition.tsx` imports `../primitives/utils` and
  `motion-kit/profile.ts` imports `../primitives/spring` instead of the
  `../primitives` barrel, so the page chunks do not pull the barrel's modules
  (and `ModalLayer.css`).

`PageTransition.css` keeps its `:root[data-ui-page-transition]` rules; nothing
on the site sets that attribute. The site adapter is
`src/components/transitions/` (shared roots may not import `src/vendor`).

Also vendored for the page tour: `tour` with its registry dependencies
(`button`, `icon-button`, `tooltip`, `spinner`, `primitives`, `icons`). The
tour does not import `valyro-ui/styles` either; it maps the tokens on its
portal host (`src/features/pageTour/PageTour.css`). `feedback/Tour.tsx` has
HearthPulse changes: `sheet` (the card docks as a bottom sheet), `footer`
(secondary actions under the step buttons), `scrollTarget` (the page scrolls
the target itself) and `spotlightInsets` (the spotlight stays in the part of
the viewport the sheet leaves free).
