# Styles: shared tokens only, no bundled theme

- Files: `styles/index.css`
- Change: imports only the shared tokens, base and motion styles;
  `styles/themes/*.css` and `styles/tailwind.css` are not shipped.
- Why: consumers map the `--ui-*` tokens in their own scope; the patch notes
  flow uses `src/shared/ui/varyloParchment.css` plus the Sankey tokens in
  `src/features/patchNotes/PatchNotesShowcase.css` (`.hp-patch-flow`).
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
