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

- Pending `feat/manacost-reader-v1-reviewed` snapshot `f5e335d1`: compared the
  module, composition, UI continuation and tests to the now-merged staging tip.
  They are identical except that the draft lacks nine lines of later consent
  Referrer-Policy/CSP fixes and their assertions. The staging draft's config,
  dependency versions and operational instructions are superseded by the
  reviewed production implementation. Preserve the verified current versions;
  the resolved merge changes no application files.

- Pending `feat/manacost-reader-production-client-20260913` snapshot
  `14f7b1ad`: all twelve source/configuration/test files already match upstream
  exactly. The three remaining documentation differences are newer release
  notes, line wrapping and the newly verified isolation option. Retained those
  current documents. The merge changes no application files; the 31 passing
  identity/startup/continuation tests remain applicable.

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
- `feat/manacost-reader-staging-20260908`: retained the current fragment-only
  login continuation, exact client allowlists, permissions/entitlements,
  fixed-expiry sessions and storage cleanup. Integrated its outstanding
  `BACKGROUND_JOBS_ENABLED=0` composition option and isolated real-server test.
  The test reproduced a merge incompatibility in shutdown registration (an
  absent subscription timer); register that timer only when present while
  retaining identity cleanup. Documentation impact: this plan, the Reader
  runbook and `CHANGELOG.md`. Selected implementation skills: incremental
  implementation, TDD, debugging, security, API/source-driven development and
  CI automation; the disproof is the failing real-server regression.
  Verification after correction: isolated backend/identity/continuation tests,
  TypeScript, architecture, full build, documentation lint and changed-code
  ratchets pass; Semgrep has zero findings/parser errors. Review confirms the
  default startup behavior is preserved and no additional helper is needed for
  this composition-only switch. No rendered frontend behavior changed.

- Pending Reader foundation `28f7ee5c`: the adapter/encryption/provider tests
  match the later staging foundation; its only module differences omit browser
  account resolution and the runtime export. Retained the integrated consent,
  grant/session binding and production configuration. No application diff.

- Pending Reader account draft `73808b28`: provider/runtime equal the preserved
  v1 draft; its new hook eagerly puts query-based continuation in `App.tsx`.
  Preserve the later lazy account wrapper and fragment-only continuation, which
  avoid logging the interaction handle and leave connect/public profiles alone.
  Removed the obsolete hook wiring after conflict resolution; no application diff.

- Pending Reader login draft `b0f715b5`: same obsolete query-based hook as the
  account draft, placed in `src/lib`. Retained the domain-owned lazy wrapper
  and removed the duplicate draft file/wiring. The original remains in its
  archive commit; no application change is needed.

- Pending community-permissions draft `b4c180f6` has identical bridge source,
  composition, tests and specification to `0ea31e8`, already reconciled above.
  Retained the exact production-client policy and newer inventory/release notes;
  the resolved application tree is unchanged.

- Pending paid-comments draft `5d569538`: subscription cache changes already
  match the current tree; the old endpoint lacks the production-client allowlist
  and bounded pre-auth rate limit. Retained those later protections, their
  documentation and regression coverage. Entitlement-route tests pass; no
  application files differ after reconciliation.

- Pending live-identity draft `da6d69fe`: cleanup implementation/schema match
  current code exactly. Keep later replay-evidence assertions, fixed grant
  deadlines, production-client rules and the dedicated verified-TLS upstream;
  the old draft used the shared legacy TLS pool. Other differences are the
  already-reconciled early staging iteration. No application diff; the passing
  identity suite includes cleanup, revocation and session-binding behavior.

## Rebased analytics history

`feat/boosty-article-analytics-20260728` was already integrated under rebased
commits. Verified original/integrated pairs:
`376fd39/5f45a8d`, `44016e2/665bc2e`, `98599c1/6e1277e`,
`a29c013/7e382b1`, `245ad55/5e961ce`, `1120ba2/5113468`,
`c795727/9108cc3`, `81dddb6/73e48a0`, `2af5fcf/d7218da`,
`f6893a7/0f61a0f`, `a410da7/88478e6`, `5d438d4/790c74e`,
`c7f90c6/44e9e4d`. Feature modules/tests match their counterparts; differences
in composition and UI include independent card-media, filters and cosmetics
work. Retained those newer implementations, current dependencies and notes.
The resolved application tree is unchanged. Boosty analytics, card period,
history storage and constructed-card route tests pass.

`feat/card-stat-periods-history`: the first twelve commits are the same rebased
card-history/synergy/trinket work, including `340efb7/774f946`,
`e594925/8eb69ec`, `461f29c/b6cbd0c`, `fdaac71/85e6936`,
`34fe1b3/93ac9e5` and `c893cc5/4f6f74b`. The final `30cf7db` explicitly records
unfinished origin migration. Retained current domain implementations, same-origin
image proxies, `hearthpulse.net` canonical URLs and the removal of external task
tracking. Preserved its two architecture proposals as historical documents,
aligned the environment example with the current runtime default, retained the
optional systemd template and updated behavioral fixtures. The obsolete
`api/class-matchups.js` remains deleted. Its recursive string-scan test assumes
that retired API directory and forbids legitimate compatibility allowlists, so it
is preserved in archive history instead of the active suite; current route and
client tests verify behavior. Documentation impact: both archived proposals,
this plan, the BG patch runbook and `CHANGELOG.md`. No service settings applied.
TypeScript caught an auto-merged assertion for the obsolete `arena-synergies`
admin section. `55284cf` explicitly removed that section during the admin
redesign, so retained its current state-machine test instead of restoring the
removed UI. Targeted behavioral tests and documentation lint pass. Application
sources are identical to the previously built tree; only examples, fixtures and
historical documentation change in this increment.

## Profile and animation iterations

`codex/hearthpulse-profile-dashboard-20260906` was integrated as `f938f9e` with
the extra summary component omitted. Active subscription styling and logout
layout already remain in the current profile. Subsequent `1adf2d8` redesigned
the workspace and `4da4b9d` deliberately removed its meta/article shortcuts.
Retained that newer design and assertions instead of restoring the omitted
summary or removed actions. The profile contract test passes and the earlier
full desktop/mobile authenticated QA covers this unchanged application tree.
