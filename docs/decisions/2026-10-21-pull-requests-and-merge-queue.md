# ADR 2026-10-21: Pull requests and the merge queue for parallel agent sessions

## Status

Accepted. Amends the integration part of
[ADR-001](001-main-auto-deploy-and-agent-coordination.md); its deploy gate is
unchanged.

## Date

2026-10-21

## Context

Six to eight agent sessions worked in parallel, and one lead session pushed
their branches to `main` one at a time, waiting about 30 minutes of CI for
each. Every branch edited the top of `CHANGELOG.md` and hand-raised ceilings in
`config/next-bundle-budgets.json` from local measurements that CI then
exceeded by 41–276 B, so each branch was rebased three to five times. One
session pushed to `main` past the queue, and a flaky test on `main` blocked
everyone.

## Decision

- Sessions open pull requests with `npm run agent:integrate` and enable
  auto-merge. The GitHub merge queue (squash, `ALLGREEN`, up to five PRs per
  group) runs CI on the combination with the newest `main` and fast-forwards
  `main`; that push deploys exactly as before.
- A ruleset without bypass actors makes the queue the only writer of `main`
  ([settings](../runbooks/agent-integration.md)).
- Changelog entries are one fragment file per change in `changelog.d/`,
  assembled into `CHANGELOG.md` at release time.
- Bundle budgets are exact per-route baselines plus a shared tolerance,
  measured after normalizing build-environment bytes; growth above it needs a
  per-change approval file ([bundle budgets](../runbooks/next-bundle-budgets.md)).

## Alternatives considered

- **Lead session keeps pushing serially.** Rejected: throughput is one branch
  per CI run and every push invalidates every other branch.
- **Require up-to-date branches without a queue.** Rejected: it recreates the
  rebase loop.
- **A PR label as bundle approval.** Rejected: labels are not available to
  the `merge_group` run without extra API calls and are not part of the diff.

## Consequences

- No session needs push rights to `main`; a red queue run removes only the
  failing PR.
- `main` is validated twice per batch (queue and push) until the push run
  reuses the queue's artifact.
- The release owner runs `changelog:assemble --release` and, periodically,
  `budget:next:baseline` in their own PRs.
