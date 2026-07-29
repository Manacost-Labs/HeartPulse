# ADR-001: Main auto-deploy and multi-session coordination

## Status

Accepted

## Date

2026-07-29

## Context

Several Codex and Claude sessions can work on HS-Arena concurrently. Production
previously depended on a manual build from a mutable workspace, so a deploy
could omit another session's merged changes or publish an unvalidated checkout.
Giving a hosted CI runner an SSH key would also create a broad reusable secret.

## Decision

- One task owns one branch and one linked worktree. Notion remains the shared
  cross-agent task ledger.
- A repository preflight fetches `origin/main`, reports dirty sibling
  worktrees, blocks overlapping uncommitted paths, and prevents integration
  when the task branch is stale or dirty.
- Only a successful push to `main` can deploy.
- Hosted CI performs all validation and produces one immutable artifact whose
  manifest SHA equals the pushed commit.
- Deterministic release checks block deployment. The full browser matrix runs
  in a separate, non-blocking advisory job until its legacy fixtures have a
  reliable baseline, so it cannot delay the immutable artifact; affected
  browser flows remain mandatory task-level checks.
- A repository-scoped self-hosted runner receives only that artifact. A
  dedicated unprivileged account may invoke one root-owned deployment gate.
- The gate validates the artifact location, permissions, symlink policy and
  exact SHA before calling the existing locked, atomic, readiness-gated
  deployer.
- GitHub's production environment and a non-cancelling concurrency group
  serialize releases.

## Alternatives considered

### Hosted runner with an SSH private key

Rejected because a long-lived deploy key would be copied into GitHub secrets
and expose a broader remote shell than deployment requires.

### Build directly in the production workspace

Rejected because mutable worktrees can contain uncommitted or parallel-session
changes and cannot prove which commit produced the running files.

### Automatically merge every agent branch

Rejected because branch presence does not establish task completeness. Agents
coordinate ownership through Notion and integrate only committed, validated
work through normal Git ancestry.

## Consequences

- A main push is production-bound only after the complete CI gate succeeds.
- Feature branches are safe to push without deploying.
- A production runner outage leaves a queued deployment instead of silently
  publishing from an alternate path.
- Deploy infrastructure changes require a reviewed manual installation of the
  root-owned gate/deployer; application releases cannot rewrite their own
  privilege boundary.
- The immutable release and `previous` symlink retain the existing rollback
  path.
