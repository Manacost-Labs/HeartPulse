# Domain modules and incremental Next.js migration

## Scope and ownership

- User request: repair the five audited behaviors, extract complete domain
  capabilities, and introduce a Next.js App Router pilot alongside Vite.
- Branch: `codex/nextjs-migration-20260922`.
- Base and audited commit: `e1ad451cc6723d1a1aeda2dbfc2bf9d4f35b9f23`.
- Worktree: `/home/debian/.codex-worktrees/nextjs-migration-20260922`.
- Every verified increment includes its tests, documentation and a separate
  commit. Continue with the next independent increment after verification.
- This plan records progress locally. External task databases and design boards
  are not required by the current project instructions.
- Deployment, integration into `main`, external announcements and changes to
  live data require a separate instruction. All runtime tests use temporary
  databases and controlled external dependencies.
- `HeartPulse-backup-2026-09-22-e1ad451.zip` contains repository history only;
  it is not a backup of production databases, uploads or other server state.

## Contracts and documentation impact

Preserve existing URLs, query parameters, cookies, subscriptions, API payloads,
visual presentation and direct navigation. Express, SQLite, Redis and scheduled
jobs continue to own their current server responsibilities during the pilot.
Dependencies follow `app -> modules -> shared`; domains expose small public
contracts and receive infrastructure dependencies explicitly.

Preparation changes this file. Auth changes will update
`docs/specs/authentication-persistence.md`, the owning architecture documentation
and `CHANGELOG.md`. Subsequent increments name their exact documentation paths
before editing. Framework selection and URL ownership require an ADR and a
runbook before the pilot is enabled. Reviewed contracts:
`docs/architecture/module-boundaries.md`, `docs/README.md`, `README.md` and the
deployment procedures linked from them.

## Required workflows

Preparation uses resource-index, using-agent-skills, context-engineering,
codegraph, spec-driven-development, planning-and-task-breakdown,
documentation-and-adrs and git-workflow-and-versioning. Auth implementation
adds debugging-and-error-recovery, test-driven-development,
incremental-implementation, security-and-hardening, api-and-interface-design,
source-driven-development and doubt-driven-development. Read and apply the
remaining matching UI, React, migration, performance and quality skills when
their increment begins. Review completed code with code-review-and-quality,
then code-simplification. No delegated implementation is planned.

## Baseline on 2026-09-22

Fresh dependencies installed from the lockfile using `npm ci`.

| Check | Result at the base commit |
| --- | --- |
| `npm run agent:session:preflight` | PASS; isolated branch, no overlapping edits |
| `npm run lint` | PASS |
| `npm run lint:architecture` | PASS; 19 modules, 221 routes, 118 middleware registrations |
| `npm run test:auth-credential-routes` | PASS |
| `npm run test:auth-verification-routes` | PASS |
| `npm run test:application-auth` | PASS |
| `npm run test:auth-sessions` | PASS |
| `npm run build` | PASS; Vite, server TypeScript and prerender |

Existing credential tests replace the registration/login use cases; they do
not reproduce concurrent SMTP completion against the real SQLite persistence.

## Ordered increments

| Step | Dependency | Acceptance and verification | State |
| --- | --- | --- | --- |
| 0. Baseline and plan | None | Current upstream verified; existing types, architecture, auth tests and build recorded | Complete |
| 1. Credential persistence | 0 | Two registrations finishing SMTP in either order preserve both users and unrelated sessions; email failure is explicit; SQL transactions end before network waits | Reproduced; paused for requested branch consolidation |
| 2. Account blocking | 1 | Browser sessions, application access/refresh tokens, issuance and tracker batches reject blocked accounts using one server policy | Pending |
| 3. Arena data states | 0 | No demo percentages in normal UI; loading, empty, error and stale real cache are distinct; source/update time visible | Pending |
| 4. BG cache recovery | 0 | Fallback snapshot expires; retries replace it when API recovers; deterministic time tests | Pending |
| 5. Card URL contract | 0 | Links, canonical, sitemap and monitor agree for ordinary IDs and encoded `blizzard:<dbf>` IDs | Pending |
| 6. Domain extraction | 1–5 | Complete account, cards, Arena and BG slices separate routes/UI, services/loaders, repositories and pure model; hotspots and ratchets shrink | Pending |
| 7. Next.js foundations | 5–6 | Official stable version/docs verified; side-by-side build; explicit URL ownership, switch and rollback; legacy default remains functional | Pending |
| 8. Public card pilot | 7 | Existing React presentation reused; indexable server HTML, canonical/sitemap, redirects and HTTP 404 verified; no private data in public cache | Pending |
| 9. End-to-end handoff | 8 | Real backend with test DB covers registration, blocking, subscription, catalog and API recovery; desktop/mobile browser, SEO, console/network/accessibility checked | Pending |

Step 6 is split into separate account, cards, Arena and BG commits. Step 7 and
step 8 are split further if configuration, routing and page behavior cannot be
reviewed and verified as one bounded change. Enable strict typing in extracted
modules without adding `any`, suppressions or architectural exceptions.

## Audit verification

- Credential race: confirmed in source at the base commit. Registration and
  login call `saveAuthStore(store)` after awaiting SMTP; persistence replaces
  pending codes and sessions and deletes users missing from the old snapshot.
  A real-backend integration test reproduced lost users with SMTP completion
  orders `[0, 1]` and `[1, 0]`. The failed-delivery test passes (HTTP 503, no
  account or pending code created). Full local evidence:
  `/tmp/hearthpulse-auth-race-red.log` (2 failed, 1 passed).
- Blocking: browser-to-user resolution already filters `blockedAt` in one
  application-auth adapter. Access-token, refresh, issuance and tracker paths
  still need independent verification; do not assume they share that filter.
- Arena demo fallback, BG fallback lifetime and card URL consistency: verify
  each current implementation and add a behavioral reproduction before changes.
- The current upstream already removed required external task/design tracking.
  No duplicate policy change is necessary.

## Verification and rollback per increment

Run focused behavior/contract tests, `npm run lint`, architecture checks,
`npm run security:semgrep` for authored JS/TS and the applicable production
build. Run selected-path `codex-semgrep` for auth/security checks. Dependency,
parser-boundary or telemetry changes also require Knip, property and Sentry
checks. Authored reusable React states require Storybook stories, preview,
tests and build. Browser-facing work receives Chrome DevTools MCP review after
automated checks. Record baseline failures separately; never disable gates.

Each commit is an independent rollback point using a reviewed `git revert` in
the task branch. No production or schema mutation is authorized. The Next.js
pilot must default to the legacy route owner and support switching only its
owned public paths back to Vite without changing API/data services. Do not
delete the Vite build until a separately verified migration phase allows it.

## Next action

The user changed the required order on 2026-09-22: consolidate outstanding
branches into `main`, clean up branches, then resume the migration on a separate
branch and merge it after validation. Production publication still requires an
explicit deployment instruction.

The reproduction tests and preliminary, unintegrated credential module are
preserved in stash commit `7f314f610f31e2f05d5dfb1033d85cf90769d145` (including
untracked files). They are not a completed implementation and must not be merged
into `main` during consolidation. After consolidation, update this branch from
the validated `main`, restore that exact stash with `git stash apply`, wire the
module into the backend and turn the two failing race tests green. Keep the
stash until the restored work has a verified commit.
