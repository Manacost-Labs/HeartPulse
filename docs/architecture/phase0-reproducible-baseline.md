# Phase 0: reproducible architecture baseline

## Command and scope

The checked baseline command is:

```bash
npm run architecture:baseline
```

It builds the current source revision first and then prints one deterministic
JSON document. For a fast repeat against an existing `dist/`, run:

```bash
node scripts/architecture-baseline.mjs
```

The source inventory includes authored `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
`.cjs` and `.css` files below `src/`, `server/` and root `shared/`. Generated,
dependency, coverage and build trees are excluded. LOC means physical lines;
large-file reporting starts above 500 lines for code and above 1,000 lines for
CSS. These thresholds identify migration candidates and are not quality scores.

The analyzer uses the TypeScript AST rather than text matching for raw `fetch`
calls, JSX inline styles, explicit `any` and imports. It separates runtime
cycles from cycles that exist only through type imports. Test reachability uses
the same filesystem discovery and checked registry as `npm test`. Bundle totals
measure the real built JavaScript and CSS assets in `dist/assets`, including
deterministic gzip level 9 sizes.

## Baseline at the Phase 0 branch head

The first checked run after commits `bb89672` and `684b834` reports:

| Metric | Baseline |
| --- | ---: |
| Product files | 412 |
| Physical LOC | 132,354 |
| Files above the reporting thresholds | 43 |
| Raw `fetch` calls, all product code | 165 |
| Raw `fetch` calls, frontend | 122 in 37 files |
| Module boundary violations | 0 |
| Runtime import cycles | 0 |
| Type-only import cycles | 4 |
| TypeScript suppressions | 8 |
| Explicit `any` nodes | 649 |
| Tests discovered / registered / excluded | 228 / 228 / 0 |
| Built JS/CSS assets | 141 |
| Built JS/CSS bytes, raw / gzip | 2,324,470 / 626,426 |
| CSS `!important` declarations | 1,188 |
| JSX inline style attributes | 453 |

The four type-only cycles are emitted with their exact members in the JSON
report. They are classified debt, not runtime cycles, and must be handled by a
separate small refactor instead of being hidden or bulk-rewritten. The raw
`fetch`, `any`, inline-style and large-file lists likewise identify ownership
for future vertical slices; reducing a number is not permission to change a
public contract.

## Stability and CI relationship

The report is observational: it does not fail merely because the inherited
baseline is large. Existing focused ratchets still enforce bundle, monolith,
CSS and component ceilings. Test discovery independently fails CI for an
unclassified authored test. The next Phase 0 slice may promote a zero-debt
metric such as runtime cycles or current module-boundary violations into a
blocking gate, with an explicit registry for any justified temporary debt.

Adding timestamps, machine-specific absolute paths or unstable filesystem
ordering to the JSON is forbidden. A saved report from the same source and
build inputs must compare byte-for-byte.
