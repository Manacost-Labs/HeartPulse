# Menu: typed for ES2022 and strict: false

- Files: `navigation/Menu.tsx`
- Change: no `findLastIndex`, and an explicit action-item narrowing.
- Why: the project compiles against the ES2022 library with `strict: false`,
  where the upstream code does not type-check.
- Upstream: not submitted; carry it over when the file is re-copied from the registry.
