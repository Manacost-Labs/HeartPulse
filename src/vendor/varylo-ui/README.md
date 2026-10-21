# VaryloUI (vendored)

Source copied from the VaryloUI registry (`r/<name>.json`, local release in
`/home/debian/varylo-ui-release`, equivalent to `npx varylo-cli add <name…>`).
Items: data-table, kpi-group, confidence-band-chart, heatmap,
metric-comparison, radar-chart, matchup-matrix (`gaming/`, `agents/labels.ts`),
scatter-chart, treemap, sparkline, trend-value, meta-table, combobox and their registry
dependencies (skeleton, primitives, styles, icon-button, tooltip, button,
spinner, empty-state, icons, theme, badge, stats-card, text-input,
search-input, select, listbox, segmented-control, breadcrumbs, dropdown-menu).
Each file keeps its registry path, so items that share a dependency share the
same file.

Local changes live one file per change in [`patches/`](patches/): the files
touched, what changed, why, and the upstream status. Each change is also
introduced by a `HearthPulse` comment in the code. Do not edit other files by
hand; re-copy them from the registry instead, and carry the listed changes over
when updating a changed file. A new local change adds a new
`patches/<slug>.md`; do not list changes in this README, so parallel branches
do not conflict here. Quality gates that scan `src/` skip `vendor`
directories or carry their inherited debt in budgets.

Also vendored, unedited: `tier-list`, `patch-notes` and `leaderboard` with
their registry dependencies (`segmented-control`, `search-input`,
`text-input` and the shared `gaming/`, `agents/`, `ai/`, `editorial/`,
`commerce/` helpers). They use the parchment token mapping in
`src/shared/ui/varyloParchment.css`, which also supplies the geometry tokens
(control heights, spacing, type scale) that only a theme would define.
React Doctor skips this directory (`doctor.config.json`), as
`scripts/react-doctor-changed.mjs` already leaves it out of its file list.
