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
