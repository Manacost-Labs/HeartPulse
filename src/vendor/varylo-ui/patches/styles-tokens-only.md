# Styles: shared tokens only, no bundled theme

- Files: `styles/index.css`
- Change: imports only the shared tokens, base and motion styles; no
  `styles/themes/*.css` file is shipped.
- Why: each consumer maps the `--ui-*` tokens onto HearthPulse tokens in its
  own scope (`src/features/ConstructedArchetypeCardStats.css`,
  `src/features/archetypeVaryloTheme.css`,
  `src/features/StandardMatchupMatrix.css`,
  `src/features/StandardMetaVarylo.css`,
  `src/shared/ui/varyloParchment.css`); a bundled theme would override them.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
