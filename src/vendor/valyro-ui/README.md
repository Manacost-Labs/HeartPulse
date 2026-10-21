# Valyro UI Pro (vendored)

Source copied from the Valyro Pro registry (`/home/debian/valyro-pro-registry`,
`<name>.json`; the release with the CLI is `/home/debian/valyro-ui-release`).
There is no `valyro-ui-pro` npm package, so items are vendored here the same
way as `src/vendor/varylo-ui`. Each file keeps its registry path.

Items: `sankey-chart` and its registry dependencies (`styles`, `theme`,
`primitives`, `icons`, `skeleton`). Valyro files differ from the VaryloUI
copies of the same names, so the two kits stay in separate directories.

Local changes live one file per change in [`patches/`](patches/): the files
touched, what changed, why, and the upstream status. Each change is also
introduced by a `HearthPulse` comment in the code. Do not edit other files by
hand; re-copy them from the registry instead, and carry the listed changes over
when updating a changed file. A new local change adds a new
`patches/<slug>.md`; do not list changes in this README, so parallel branches
do not conflict here. Oxlint, React Doctor and the CSS `:root` rule skip this
directory; its inherited non-null assertions are budgeted in
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
presets). Its local change is
`patches/motion-kit-direct-primitive-imports.md`.

`PageTransition.css` keeps its `:root[data-ui-page-transition]` rules; nothing
on the site sets that attribute. The site adapter is
`src/components/transitions/` (shared roots may not import `src/vendor`).

Also vendored for the page tour: `tour` with its registry dependencies
(`button`, `icon-button`, `tooltip`, `spinner`, `primitives`, `icons`). The
tour does not import `valyro-ui/styles` either; it maps the tokens on its
portal host (`src/features/pageTour/PageTour.css`); its local change is
`patches/tour-sheet-footer-scroll-spotlight.md`.

Also vendored for the personal account: `billing-plan-card` (Valyro Pro:
`ai/BillingPlanCard`, `ai/QuotaMeter`, `ai/format.ts`) and `progress-bar`
(`basic/ProgressBar`), unchanged; it shares the tour's `basic/Button`. The
account does not import `valyro-ui/styles` either: the wrapper
`src/features/AccountBillingPlanCard.tsx` uses the VaryloUI base, the shared
parchment mapping and, in `AccountBillingPlanCard.css`, the few theme-only
tokens the card reads (`--ui-space-6`, `--ui-text-2xl`, …).
