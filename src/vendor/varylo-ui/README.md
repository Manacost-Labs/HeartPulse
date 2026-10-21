# VaryloUI (vendored)

Source copied from the VaryloUI registry (`r/<name>.json`, local release in
`/home/debian/varylo-ui-release`, equivalent to `npx varylo-cli add <name…>`).
Items: data-table and its registry dependencies (skeleton, primitives, styles,
icon-button, tooltip, button, spinner, empty-state, icons, theme).

Local changes: `styles/index.css` imports only the shared tokens, base and
motion styles; no `styles/themes/*.css` file is shipped. Consumers map the
`--ui-*` tokens onto HearthPulse tokens inside their own scope (see
`src/features/ConstructedArchetypeCardStats.css`). Do not edit other files by
hand; re-copy them from the registry instead.
