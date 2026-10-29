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
- Run selected suites: `npm run test:suite -- <id>[,<id>...]`, optionally with
  `--shard <index>/<total>`, `--retry-failed-once`, `--continue-on-failure`
  and `--quarantine <exclude|only>`.
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

Discovery exposed two direct browser-source violations, which have since been
removed. `public-resource-browser-contract` now asserts an empty baseline and
fails on any browser source that names a third-party host directly.

## Execution contract

Each test runs in its own child process, sequentially, with no shell expansion:

- TypeScript and TSX use Node with the checked `tsx` loader;
- JS, MJS, and CJS use Node directly;
- shell tests use Bash directly.

Per-file environment overrides are explicit in the registry and do not leak to
other files. Execution stops on the first failure (after the single retry,
when enabled) and preserves the failing exit code or termination signal.

## CI sharding and flaky retries

CI runs the `browser` suite as a matrix of shards
(`npm run test:suite -- browser --shard i/N --retry-failed-once
--continue-on-failure --quarantine exclude`) and the other four suites as a
second matrix
(`npm run test:suite -- unit,integration,contract,production-smoke --shard
i/N --continue-on-failure`, no retries). Each shard
computes the same deterministic partition from the registry and
`tests/test-durations.json`: files are assigned longest first to the lightest
shard, a file without a recorded duration weighs `defaultSeconds`, and each
shard keeps registry order. Every selected file lands in exactly one shard;
`tests/test-suite-runner.test.mjs` and `tests/workflow-contract.test.mjs`
prove it for the checked registry and the CI shard count. Durations only steer
the balance, so a stale or missing entry never skips a test. To rebalance,
copy the per-file durations from the shard job summaries into
`tests/test-durations.json`.

With `--retry-failed-once` a file that exits nonzero or crashes is rerun once
in the same shard. A pass on the retry is logged as
`[test-suite] FLAKY <suite> <file>`, raised as a GitHub warning annotation and
listed as FLAKY in the job summary; a second failure fails the shard. Runner
interruptions and processes that cannot start are not retried. The report
counts a retry-pass as a failure: the summary line reads `Reported failures:
<FAIL + FLAKY>` and the final log line ends in `reported-failures=<n>`, but only
a FAIL fails the job, so a retry-pass never blocks the merge queue.

CI jobs pass `--continue-on-failure`: after a real failure the job still runs
its remaining files and then fails, naming every failing file, so one run
reports all failures instead of hiding the rest of the shard. An interrupted
runner (a cancelled or timed-out job) stops at once. Every run with
`GITHUB_STEP_SUMMARY` set writes a per-file PASS/FLAKY/FAIL/NOT RUN table with
durations. Local `npm test` keeps the original behavior: no shards, no
retries, and a stop at the first failure.

## Quarantine

Known flaky tests are listed in the `quarantine` array of
`tests/test-suites.json`; each entry names a classified `file`, a GitHub
`issue` URL (one issue per test, titled `flaky: <test>`) and a `reason`. The
registry gate (`npm run test:registry`) rejects an entry whose file is not
classified, whose issue is not a GitHub issue URL, whose reason is blank, or
that repeats. A quarantined file stays in its suite; only browser tests may be
quarantined (`tests/workflow-contract.test.mjs`), because only the browser
shards skip the quarantine.

CI runs the quarantine in the job `Browser quarantine (non-blocking)`
(`npm run test:suite -- browser --retry-failed-once --continue-on-failure
--quarantine only`) on pull request and `workflow_dispatch` runs only: the
merge queue and `main` neither start nor wait for it, and flake data comes from
pull requests. The job has `continue-on-error: true` and neither `CI required`
nor the deployment needs it, so a red quarantine is visible in the run and its
step summary but never blocks a merge or a release. Local `npm test` still
runs quarantined files.

- **Add**: open an issue `flaky: <test>` with the evidence (run links), add the
  entry with that issue URL, and run `npm run test:registry`.
- **Remove**: fix the test with event or state waits instead of timers (plan
  item 4.4), delete its entry in the same PR and close the issue once it passes
  in the blocking shards.

The goal of the quarantine (improvement plan Q6) is five consecutive green
push runs of `main` with no FLAKY line in any blocking shard. Its exit
criterion (plan 4.4) is an empty `quarantine` array and a retry-pass share
below 1 % of browser files run.

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
