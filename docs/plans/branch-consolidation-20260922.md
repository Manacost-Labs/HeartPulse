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

`fix/hearthpulse-arena-motion-20260910`: its stable card geometry and readable
percentage labels are incorporated in `d49bbcc`, then refined by `9079e28`
(scoped styles), `16c1e96` (forced-colors contrast) and `ec044d8` (smooth motion).
Retained the current stronger assertions, scoped CSS, reduced-motion behavior
and gentle entrance delays. Removed only the duplicate old global meter styles
from the merge result. The application tree is unchanged; Chromium geometry,
hover, reduced-motion and forced-colors checks pass.

### Route/module branch reconciliation

`fix/route-inventory-canonical-read-20260818` contributes the domain extraction,
Telegram identity binding and checked agent context tooling. Its older account
UI was reconciled with current profile controls, social providers, Patreon,
Cover and Reader. Obsolete deck-builder/archetype navigation stays removed.
Current BG full-card/golden-buddy images remain exported by the domain policy.

Both architecture inventories remain enforced. Two resolved type-only cycles
were removed; no import exception allowance increased. The existing login
function budget follows its new owner and drops from 936 to 763 lines. Moved
fetch ownership is accounted for without increasing the repository total;
newly extracted code loses obsolete SQLite suppressions and explicit `any`.

Cookie regression tests reproduced rejection of old sessions and invalid
Domain attributes on the new host-prefixed cookie. Both now pass, including
real Reader consent/code/profile requests through a temporary database.

The file-size baseline follows the partial identity extraction: the original
4,829-line DeferredRoutes allowance becomes 3,192 + 1,042 lines across the two
owners (4,234 total). This preserves and lowers existing debt, while new query,
Telegram-schema and route-surface files stay under the default 250-line limit.

Verification also uses performance-optimization plus the web-quality audit,
performance, Core Web Vitals and accessibility skills. The original frontend
was rebuilt in the parked, clean migration worktree (unchanged from e1ad451).
Initial JS gzip decreases from 81,977 to 81,659 bytes; raw JS changes from
260,117 to 260,852 bytes, and initial CSS from 136,808 to 137,343 bytes after
moving eager avatar presentation into its public stylesheet. The compressed
startup gate remains unchanged. DeferredRoutes + login JS becomes 107,549
bytes versus the previous combined 107,936-byte route. Admin shell JS/CSS
remain exactly 5,334/34,727 bytes; their inherited older-branch limits were
corrected to these verified pre-existing sizes. Profile-hero CSS decreases
from 6,113 to 6,101 bytes. No threshold was removed or bypassed.

Validation for this integration: all 272 registered unit/integration/contract
files pass (271 in the final batch, then the relocated route-surface assertion
passes separately); TypeScript, architecture, clean-code, registry and agent
tooling checks pass. Vite/server/prerender and Storybook build successfully;
Knip, property and Sentry checks pass. Semgrep reports zero findings/errors and
the pinned redacted Gitleaks scan reports no secrets in history or pending files.

The deterministic production-build browser suite passes desktop/mobile flows
and axe checks. Chrome DevTools MCP additionally reviews all 14 changed profile,
public-profile and Telegram states at 1440 and 390 pixels from built Storybook:
28 completed renders, no console errors and no overflow. The focused profile
review has no failed requests, validates its accessibility tree and inspects
screenshots; local LCP is 440 ms and initial CLS is 0.096 (lab-only measurements,
not production field data). Development-only HMR disconnections disappeared
when reviewing the built workshop. No deployment or external message occurred.

Storybook review links: [changed stories](http://localhost:6006/?statuses=affected;modified;new),
[active subscription](http://localhost:6006/?path=/story/profile-account-workspace--active-subscription),
[Telegram account linking](http://localhost:6006/?path=/story/identity-telegram-account-link-actions--oidc-and-bot-ready),
[access check](http://localhost:6006/?path=/story/profile-access-summary--checking).

### Independent game-data audit

The module extraction merge was verified and committed as `948762c`. The next
independent branch adds a read-only audit CLI, bounded source collection and
optional AI review. Documentation impact: the audit spec, runbook, ADR, module
ownership registries, deployment instructions, agent-tooling notes, changelog
and this plan. Reconcile with the current test registry and split new files to
meet the existing clean-code limits; do not increase debt allowances. The
systemd template keeps AI review off by default, and no service is installed or
started by this integration.

Verified: all five audit test files, TypeScript, server build, architecture and
HTTP-manifest checks, module catalog tests, test registry, clean-code checks,
documentation lint, Knip, property tests and Sentry privacy tests pass. Semgrep
reports zero findings or parser errors; full-history and pending-file Gitleaks
scans report no leaks. The 375-line collector is split into transport, document,
JSON and health boundaries with no new `any` or debt allowances. Provider order
remains Scrape.do, Firecrawl key rotation, then Scrapfly. External providers and
the optional AI process were mocked in tests.

### Preserved legal-page draft

The audit pipeline merge is committed as `55f2dea`. Integrate archived draft
`d58b806` through the current routing manifest and a separate legal-pages module.
Documentation impact: `docs/specs/legal-pages.md`, module ownership registries,
SEO inventories, `CHANGELOG.md` and this plan. The stored legal text is preserved
from the user's draft; this integration does not certify legal adequacy or
publish it. Verify both routes, shared prerender text and mobile presentation.

The two legal routes add 538 raw bytes to startup JS (261,390 total), while
gzip remains within the unchanged 81,880-byte limit at 81,815 bytes. Raw budgets
allow that measured routing increment plus the existing hash-length margin;
the document content and styles stay lazy. Route and prerender tests, TypeScript,
Storybook build/contracts and clean-code checks pass.

Chrome DevTools MCP verified both legal pages and the footer at 1440 and 390
pixels: six completed renders, no horizontal overflow, console errors or
failed requests in the built workshop. Mobile and desktop screenshots were
inspected. A real E2E regression exposed undersized tablet legal links; all
footer links now retain the existing 44px target minimum. The new row has
explicit height limits documented in the legal-page spec.

Storybook: [privacy](http://localhost:6006/?path=/story/public-legal-documents--privacy),
[terms](http://localhost:6006/?path=/story/public-legal-documents--terms), and
[footer](http://localhost:6006/?path=/story/navigation-site-footer--legal-links).

Before cleanup, all 11 original dirty worktrees were compared against their
immutable snapshot indexes: unchanged heads and file contents, no new untracked
files. Cleanup remains pending until both final draft snapshots are integrated.

Final legal-page verification: authenticated/mobile E2E passes after fixing the
44px tablet targets and measuring the medium footer at 401.77px (404px limit).
The broad responsive run passed 320px and 390px; the subsequent green run
rechecks 768px alongside the full authenticated/navigation flows. Both builds,
route/SEO/Storybook contracts, architecture, bundle budgets, documentation,
clean-code and Semgrep checks pass. The original staged patches also match all
11 saved backups exactly.

### Preserved manual authentication acceptance

Legal pages were committed as `d9d8bbb`. The final archived draft adds an
interactive production-authentication helper. Documentation impact:
`docs/runbooks/manual-auth-acceptance.md`, `CHANGELOG.md` and this plan; the test
registry must retain its explicit exclusion from unattended suites. A red
regression proves the original helper does not reject non-interactive use
before prompting. Require a TTY, keep the explicit human confirmation, use the
public Writable API to hide password input, preserve CSRF Origin and avoid
newsletter enrollment. No production requests or emails are authorized here.

The manual-helper guard reproduces red before the fix and passes afterward.
Registry, clean-code and documentation checks pass. Password masking uses a
Writable output stream instead of Node's private readline method. The helper
was not run interactively; no accounts, emails or production data were changed.

The combined unit/integration/contract run covered 278 test files: 277 passed;
one existing QA-source contract still expected ten footer links. It now expects
twelve, consistent with the rendered footer and preserved 44px checks. A focused
rerun verifies that correction. Project Semgrep, the selected manual-auth
`codex-semgrep` scan and both Gitleaks scans report no findings.
