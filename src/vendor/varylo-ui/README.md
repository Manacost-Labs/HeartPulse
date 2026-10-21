# VaryloUI (vendored)

Source copied from the VaryloUI registry (`r/<name>.json`, local release in
`/home/debian/varylo-ui-release`, equivalent to `npx varylo-cli add <name…>`).
Items: data-table, kpi-group, confidence-band-chart, heatmap,
metric-comparison and radar-chart with their registry dependencies (skeleton,
primitives, styles, icon-button, tooltip, button, spinner, empty-state, icons,
theme, badge, stats-card, sparkline); matchup-matrix (`gaming/`,
`agents/labels.ts`) with select (`forms/Select`, `forms/Listbox`), themed in
`src/features/StandardMatchupMatrix.css`.

Local changes: `styles/index.css` imports only the shared tokens, base and
motion styles; no `styles/themes/*.css` file is shipped. Consumers map the
`--ui-*` tokens onto HearthPulse tokens inside their own scope (see
`src/features/ConstructedArchetypeCardStats.css` and
`src/features/archetypeVaryloTheme.css`). Do not edit other files by hand;
re-copy them from the registry instead. Quality gates that scan `src/` skip
`vendor` directories or carry their inherited debt in budgets.
