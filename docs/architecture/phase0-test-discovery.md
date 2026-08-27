# Phase 0 test discovery

## Objective

Replace the manually chained test command with one repository-wide discovery
contract. The change is infrastructure-only: it must not change public routes,
API payloads, permissions, data, or browser behavior.

The baseline for this slice is:

- source and `origin/main`: `57dfb48fffb0bcfec4e4dc6eb69298bcdab838e2`;
- production release: `57dfb48fffb0bcfec4e4dc6eb69298bcdab838e2`;
- discoverable authored tests: 226;
- tests reachable from the former `npm test` chain: 203.

The older `refactor/modular-phase0-20260817` branch is reference material only.
No branch-wide merge or unverified cherry-pick is part of this slice.

## Commands

- Validate discovery and its own contract: `npm run test:discovery`.
- Run every classified authored test: `npm test`.
- Run the release gate: `npm run verify:release`.

## Discovery contract

Authored test files are found repository-wide by the suffixes
`*.test.{ts,tsx,js,mjs,cjs,sh}` and `*.spec.{ts,tsx,js,mjs,cjs,sh}`.
Generated, dependency, cache, coverage, and report trees are ignored.

Every discovered file must be registered exactly once as one of:

- `unit`;
- `integration`;
- `contract`;
- `browser`;
- `production-smoke`.

The checked registry classifies the current flat legacy suite. New tests may be
placed anywhere in authored source, but CI fails until their owner chooses a
category. The discovered filesystem remains authoritative: stale registry
entries, duplicate classifications, missing classifications, unsupported file
types, and unexplained exclusions all fail validation.

Exclusions live only in the registry and require a non-empty reason. There are
no exclusions in the initial baseline.

Discovery exposed two existing direct browser-source violations in
`ArenaSynergyCardIdentity.tsx` and `battlegroundTrinkets.ts`. Their existing
paths are asserted as an exact ratchet by `public-resource-browser-contract`:
the test still executes and fails on additions or drift, while removing the two
legacy sources remains a separate behavior-changing network-boundary slice.

## Execution contract

Each test runs in its own child process, sequentially, with no shell expansion:

- TypeScript and TSX use Node with the checked `tsx` loader;
- JS, MJS, and CJS use Node directly;
- shell tests use Bash directly.

Per-file environment overrides are explicit in the registry and do not leak to
other files. Execution stops on the first failure and preserves the failing
exit code or termination signal.

## Boundaries

- Always preserve the existing test file contents and product contracts.
- Ask first before excluding or deleting an authored test.
- Never make a failing check green by disabling a test or CI gate.
- Do not require production credentials or network access for discovery.

## Success criteria

- All 226 baseline test files are classified exactly once and are runnable from
  `npm test`.
- Adding an unclassified test makes `npm run test:discovery` and CI fail.
- Removing or renaming a classified test without updating the registry fails.
- The release gate invokes discovery before the full suite.
- Project checks pass with no product behavior change.

## Rollback

Revert the single test-discovery commit. The former targeted `test:*` commands
remain available during this slice, so focused maintainer workflows do not lose
their entry points.
