# Typing under strict: false

- Files: `primitives/react-compat.ts`, `theme/createThemeCSS.ts`
- Change: an explicit type where `void | (() => void)` does not narrow under
  `??`, and an explicit return type for a conditional.
- Why: the project type-checks with `strict: false`, where the upstream
  conditionals do not narrow.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
