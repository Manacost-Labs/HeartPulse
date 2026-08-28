# Clean-code quality gate

## Purpose and first-slice scope

The clean-code gate prevents new TypeScript and TSX debt while legacy code is
reduced through small vertical slices. It is local, deterministic and does not
use network services or add a dependency. The implementation composes the
existing TypeScript AST inventory and named-function analyzer instead of
parsing another command's console output or maintaining a third analyzer.

This first slice enforces authored files below `src/`, `server/` and `shared/`.
Generated, build, dependency and vendored trees are excluded. CSS, React hook
complexity, import fan-out and dead-code candidates remain reportable work for
later slices; they are not silently claimed as enforced here.

## Commands

- `npm run quality:clean-code` checks every authored TS/TSX file.
- `npm run quality:clean-code:changed` checks added, modified and renamed
  files relative to the resolved Git base.
- `npm run quality:clean-code:report` prints a read-only full report. Add
  `-- --format=json` or `-- --format=markdown` for machine-readable output.
- `npm run quality:clean-code:baseline` previews a deterministic baseline
  candidate without writing files.
- `npm run test:clean-code-gate` runs the gate's behavioral regression tests.

Use `CLEAN_CODE_BASE=<commit-or-ref>` to choose an explicit changed-file base.
In pull requests and push workflows the resolver uses the same checked Git
fallback order as the changed-file Semgrep gate. A renamed file inherits its
old path's budgets, while a copy or unrelated added file receives new-file
limits.

Module-focused reports use the same CLI directly:

```bash
node scripts/clean-code/cli.mjs report \
  --module=src/modules/developerApi \
  --format=markdown
```

## Enforced rules

- New authored TS/TSX files may contain at most 250 physical lines.
- Each legacy file above that limit has its exact per-file ceiling in
  `config/clean-code-baseline.json`; the ceiling may stay level or decrease,
  but may not grow.
- Explicit `any`, TypeScript suppressions, non-null assertions and frontend
  raw `fetch` calls reuse `config/source-debt-budgets.json`. A missing path has
  a zero budget.
- Named functions reuse `config/function-size-budgets.json`: the default limit
  is 120 physical lines and every inherited larger function has an exact
  ceiling.
- TypeScript parse diagnostics block the gate. Invalid JSON, unknown schemas,
  unsafe paths and expired exceptions also fail closed.

Every finding has a stable ID such as `file-lines:src/example.ts`,
`source-debt:explicitAny:src/example.ts` or
`function-lines:src/example.ts#loadExample`. Human, JSON and Markdown reports
sort by these IDs so identical inputs produce byte-stable output.

## Exceptions and baseline changes

Exceptions live in the baseline and match one exact finding ID. Every entry
requires a non-empty `owner`, a concrete `reason` and an ISO expiry date:

```json
{
  "id": "file-lines:src/modules/example/compatibility.ts",
  "owner": "example module",
  "reason": "Temporary compatibility facade while callers migrate",
  "expires": "2026-09-30"
}
```

An expired exception fails even when the affected file is not in the selected
scope. This prevents a stale waiver from becoming invisible.

To accept measured reductions after tests prove the change, run:

```bash
npm run quality:clean-code:baseline -- --accept
```

The command writes only `config/clean-code-baseline.json` and refuses a new or
larger legacy file budget. `--initialize` is accepted only while the checked
baseline is empty; it cannot be reused after the initial repository snapshot.
Review the baseline diff and commit it atomically with the code and tests that
caused the reduction.

## CI relationship and current baseline

`quality:clean-code:changed` is release-blocking. The full command and report
are intentionally not part of the blocking release chain during this first
slice; existing architecture gates continue to protect repository-wide source
and function budgets while the new file-size ratchet gains operational history.

The initial baseline at `2afc0bb321a89426331c7077b214f48d25fdc422`
contains 354 authored TS/TSX files and 77 legacy files above 250 lines. The
vendored HSReplay adapter is excluded. At introduction the combined gate has
zero unsuppressed findings and no exceptions.
