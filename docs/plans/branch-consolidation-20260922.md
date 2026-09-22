# Branch consolidation before the Next.js migration

## Authorized order

On 2026-09-22 the user requested: clean up branches, combine outstanding work in
`main`, then perform the migration in a separate branch and merge it after
verification. Local commits and conflict resolution are authorized. Production
publication and external announcements are not part of this consolidation.

Work in `codex/consolidate-main-20260922`, based on
`e1ad451cc6723d1a1aeda2dbfc2bf9d4f35b9f23`. Preserve every unique change before
cleaning a branch. Preserve secrets, ignored runtime files, uploads, databases,
releases and existing backups. Never force-push `main`.

Documentation impact: this plan records the integration decisions and evidence;
`CHANGELOG.md` records any resulting maintainer-visible change. Existing feature
documents change only when conflict resolution changes their contract. Selected
skills: resource-index, using-agent-skills, context-engineering,
git-workflow-and-versioning, documentation-and-adrs, debugging-and-error-recovery,
test-driven-development, code-review-and-quality and code-simplification;
apply the project router before any substantive code correction.

## Protected state

- Initial inventory: 128 local branches, 90 already ancestral to `origin/main`,
  38 divergent branches including the migration preparation branch.
- Eleven pre-existing worktrees contain uncommitted changes.
- Backup directory:
  `/home/debian/backups/hearthpulse-consolidation-20260922-01a0ca68`.
- `all-refs.bundle` preserves Git history and refs; `git bundle verify` passed.
- `worktrees.json`, per-worktree binary patches and untracked-file tar archives
  preserve the 11 dirty worktrees. No original worktree was cleaned to make the
  backup. Ignored data stays in place and must survive any worktree cleanup.
- Migration preparation has its own branch and plan. The unfinished credential
  code and red regression tests are in stash
  `7f314f610f31e2f05d5dfb1033d85cf90769d145`. They must not enter the consolidation.

## Acceptance and checkpoints

1. Verify backups, classify branch ancestry and patch equivalence, and reduce
   divergent branches to independent tips before attempting merges.
2. Reconcile each independent tip with current `main`, keeping current fixes
   and incorporating outstanding behavior. A different commit hash alone is
   not proof of missing work; record exact equivalent or superseded changes.
3. Inspect, scan and preserve uncommitted work, then integrate its valid changes.
   Do not commit secrets, temporary artifacts or redundant superseded copies.
4. After each bounded integration, run relevant checks and commit its source,
   tests and documentation together. Do not disguise conflicts with blanket
   `ours`/`theirs` resolution or claim a failing check is green.
5. Run complete required validation on the combined tree, then fast-forward the
   local `main` to the validated result. Keep outstanding work out of `main`.
6. Delete only branches whose work is integrated or proven redundant and
   recoverable. A worktree with ignored runtime data is preserved, even when
   its already-integrated branch can be detached and deleted safely.
7. Rebase/merge the migration branch onto the consolidated `main`, restore its
   exact stash and continue `docs/plans/nextjs-migration.md`.

Rollback: retain the private bundle, per-worktree archives and original commit
IDs. Before updating `main`, record its old SHA. Integration happens in this
isolated branch, so unresolved merges cannot affect the working `main`. Restore
branches from the bundle when needed; do not delete backup refs or files merely
because integration passed.

## Verified progress

- Current upstream fetched; isolated worktree preflight passed.
- Backups completed and verified.
- Removed 79 local branches already ancestral to upstream after checking their
  saved SHA and clean worktree state. Detached 78 corresponding worktrees at
  exactly the same commits, preserving every file (including ignored state).
  Ten branches with dirty worktrees and `main` remain protected. Exact receipts:
  `merged-branch-cleanup.json` in the backup directory.
- Divergent history reduced to 13 independent tips (excluding migration).
- `chore/hearthpulse-reader-audit-20260910`: the sole commit is patch-equivalent
  to upstream. A three-way merge produced no file changes; its ancestry is now
  recorded without changing application behavior. Review/simplification found
  no new code to alter; baseline verification remains applicable.
- `feat/manacost-reader-production-client-final-20260913`: all source and test
  changes merge identically to current upstream. The only conflict is an empty
  incoming changelog section against newer release notes; retain those notes.
  The existing production-client entry is present on both sides. Resulting
  application tree is unchanged; this merge records the integrated ancestry.
- `fix/clean-code-ratchet-hardening-20260828`: integrated the five-commit
  tooling/deployer-contract branch without conflicts. Review checked CI base
  selection, rename-budget constraints, prepared writes and deployer drift
  handling. The extracted modules keep policy separate from collection and CLI
  orchestration; no further simplification is needed for this integration.
  Validation: 23 focused tests, TypeScript, architecture and complete build pass;
  changed-file Semgrep reports zero findings and zero parser errors. The deploy
  installer was not executed against production.
- `codex/hearthpulse-tavern-navigation-20260914`: retained the newer targeted
  scroll in the failed-home-chunk case, included the missing deferred-section
  activation and scoped menu-title assertions to their actual title elements.
  Syntax and deterministic authenticated/desktop/mobile browser scenarios pass
  against the local production build (`QA_RESPONSIVE_SCOPE=off`; the separate
  observatory matrix was outside this test-only increment). No application
  rendering code changed. Evidence:
  `/tmp/hearthpulse-consolidation-navigation-qa.log`.
- Initial upstream checks already passed in the migration preparation worktree:
  TypeScript, architecture, credential/verification/application-auth/session
  tests and full Vite/server/prerender build.

- Preserved all eleven dirty worktrees as immutable archive commits using
  alternate indexes, without changing their original files or indexes. The
  pending-file secret scan passed; `worktree-snapshots.json` and
  `snapshots.bundle` in the backup directory preserve the exact receipts.
- Imported the two pending documentation files from the old `main` worktree.
  `docs/agent-skills.md` indexes canonical resources without changing routing;
  `META_INTELLIGENCE_LAB_SUMMARY.md` is explicitly marked as a historical draft,
  not a claim that the proposed API, jobs or budget are active. No code changes.

Next action: reconcile remaining independent branches and archived pending work
with current contracts, verify each bounded change, and record its merge.

## Superseded Reader iterations

- `feat/reader-community-identity-release-20260910`: its permission bridge is
  already present. Compared source, tests and specification: the only behavior
  difference is the old staging-only client restriction. Preserve the newer
  exact production/staging allowlist, production-client rejection tests, newer
  route inventory and release notes. The resolved application tree is unchanged;
  all nine permission-route tests pass against temporary SQLite databases.
- `feat/reader-session-30-days-20260910`: fixed-expiry grants, session bindings,
  rotation and consent tests are already present. Removed the duplicate old
  staging-only grant-policy block introduced by automatic merging; retained the
  newer production-aware policy, its tests and documentation. The application
  tree remains unchanged; the complete browser-identity suite passes.
