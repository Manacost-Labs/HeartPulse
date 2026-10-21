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

Local changes:

- `styles/index.css` imports only the shared tokens, base and motion styles;
  no `styles/themes/*.css` file is shipped. Consumers map the `--ui-*` tokens
  onto HearthPulse tokens inside their own scope (see
  `src/features/ConstructedArchetypeCardStats.css`,
  `src/features/archetypeVaryloTheme.css`,
  `src/features/StandardMatchupMatrix.css` and
  `src/features/StandardMetaVarylo.css`).
- `charts/ScatterChart.tsx`/`.css`: `referenceLines` (dashed guides, e.g. a 50%
  win rate) and `onPointClick` (click or Enter; on touch the first tap only
  shows the tooltip) for the meta map.
- `gaming/MetaTable.tsx`/`.css`: `renderTier` (the site's `TierBadge`, see
  `assets.md`), `showBanRate` (Hearthstone has no bans) and `trendColumn` (a
  sparkline cell); the change under a rate is drawn with `TrendValue`.
- `navigation/Menu.tsx`: typed for the project's ES2022 library (no
  `findLastIndex`, an explicit action-item narrowing under `strict: false`).

Each change is introduced by a `HearthPulse` comment. Do not edit other files by hand;
re-copy them from the registry instead, and carry these changes over when
updating the changed ones. Quality gates that scan `src/` skip `vendor`
directories or carry their inherited debt in budgets.

Also vendored, unedited: `tier-list`, `patch-notes` and `leaderboard` with
their registry dependencies (`segmented-control`, `search-input`,
`text-input` and the shared `gaming/`, `agents/`, `ai/`, `editorial/`,
`commerce/` helpers). They use the parchment token mapping in
`src/shared/ui/varyloParchment.css`, which also supplies the geometry tokens
(control heights, spacing, type scale) that only a theme would define.
React Doctor skips this directory (`doctor.config.json`), as
`scripts/react-doctor-changed.mjs` already leaves it out of its file list.
