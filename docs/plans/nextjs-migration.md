# Domain modules and incremental Next.js migration

## Scope and ownership

- User request: repair the five audited behaviors, extract complete domain
  capabilities, and introduce a Next.js App Router pilot alongside Vite.
- Branch: `codex/nextjs-migration-20260922`.
- Audited commit: `e1ad451cc6723d1a1aeda2dbfc2bf9d4f35b9f23`.
- Worktree: `/home/debian/.codex-worktrees/nextjs-migration-20260922`.
- Every verified increment includes its tests, documentation and a separate
  commit. Continue with the next independent increment after verification.
- This plan records progress locally. External task databases and design boards
  are not required by the current project instructions.
- Deployment, external announcements and changes to
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

- `npm run agent:session:preflight`. Result at the base commit: PASS; isolated
  branch, no overlapping edits
- `npm run lint`. Result at the base commit: PASS
- `npm run lint:architecture`. Result at the base commit: PASS; 19 modules, 221
  routes, 118 middleware registrations
- `npm run test:auth-credential-routes`. Result at the base commit: PASS
- `npm run test:auth-verification-routes`. Result at the base commit: PASS
- `npm run test:application-auth`. Result at the base commit: PASS
- `npm run test:auth-sessions`. Result at the base commit: PASS
- `npm run build`. Result at the base commit: PASS; Vite, server TypeScript and
  prerender

Existing credential tests replace the registration/login use cases; they do
not reproduce concurrent SMTP completion against the real SQLite persistence.

## Ordered increments

- Step 0: Baseline and plan. Dependency: None; Acceptance and verification: Current
  upstream verified; existing types, architecture, auth tests and build
  recorded; State: Complete
- Step 1: Credential persistence. Dependency: 0; Acceptance and verification: Two
  registrations finishing SMTP in either order preserve both users and unrelated
  sessions; email failure is explicit; SQL transactions end before network
  waits; State: Complete
- Step 2: Account blocking. Dependency: 1; Acceptance and verification: Browser
  sessions, application access/refresh tokens, issuance and tracker batches
  reject blocked accounts using one server policy; State: Complete
- Step 3: Arena data states. Dependency: 0; Acceptance and verification: No demo
  percentages in normal UI; loading, empty, error and stale real cache are
  distinct; source/update time visible; State: Complete
- Step 4: BG cache recovery. Dependency: 0; Acceptance and verification: Fallback
  snapshot expires; retries replace it when API recovers; deterministic time
  tests; State: Complete
- Step 5: Card URL contract. Dependency: 0; Acceptance and verification: Links,
  canonical, sitemap and monitor agree for ordinary IDs and encoded
  `blizzard:<dbf>` IDs; State: Complete
- Step 6: Domain extraction. Dependency: 1–5; Acceptance and verification: Complete
  account, cards, Arena and BG slices separate routes/UI, services/loaders,
  repositories and pure model; hotspots and ratchets shrink; State: Pending
- Step 7: Next.js foundations. Dependency: 5–6; Acceptance and verification: Official
  stable version/docs verified; side-by-side build; explicit URL ownership,
  switch and rollback; legacy default remains functional; State: Pending
- Step 8: Public card pilot. Dependency: 7; Acceptance and verification: Existing
  React presentation reused; indexable server HTML, canonical/sitemap, redirects
  and HTTP 404 verified; no private data in public cache; State: Pending
- Step 9: End-to-end handoff. Dependency: 8; Acceptance and verification: Real
  backend with test DB covers registration, blocking, subscription, catalog and
  API recovery; desktop/mobile browser, SEO, console/network/accessibility
  checked; State: Pending

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

## Consolidation checkpoint (completed)

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

## Resumed after consolidation

Local `main` is clean at `12ec5868020f40d5ea77e05b6d3a4e4b5e75cfec`. All old
branches and 11 dirty worktrees were integrated or reconciled with preserved
backups; only `main` and this migration branch remain. The two planning commits
were rebased onto that main, and the exact recorded stash was restored. Local
main integration after verification is explicitly authorized; no push or
production deployment is authorized.

Recheck the SMTP race against this new base before wiring the credential module.
Keep isolated backend jobs disabled. Credential HTTP validation, service, code
issuance and targeted SQL belong to `server/modules/accountCredentials`; retain
existing account/profile/contact side effects through an injected adapter.
Documentation impact: this plan, authentication-persistence spec, architecture
ownership, changelog and the manual-auth runbook. The manual acceptance helper
must request explicit newsletter consent because the existing registration
contract requires it; it must not silently submit an incompatible false value.

## Credential persistence verified

The race was rechecked on the consolidated base: both controlled SMTP orders
lost users before the fix (two failed tests, one delivery-failure test passed).
After targeted persistence, six real-backend cases pass: both registration
orders, failed delivery followed by retry, concurrent profile edits, account
blocking during SMTP and password change during SMTP. An unrelated write during
delivery proves no SQLite transaction spans the network wait. Failed-code
attempts changed concurrently are preserved.

Existing credential, verification, session, reset and authentication-security
contracts pass, along with TypeScript, server compilation, architecture, test
registry and clean-code checks. Semgrep and selected-path auth scans report zero
findings; full-history and pending-file Gitleaks scans find no secrets. The HTTP
manifest changes only the router's owning source file (222 routes remain).

The manual helper separately requires the registration API's existing newsletter
consent. A local pseudo-terminal check verified password masking and refusal
without network requests; the unattended guard also passes. No production
acceptance test was run. Next: reproduce and repair application-token blocking.

## Account blocking increment

Documentation impact: this plan, `docs/specs/public-api-v1-first-slice.md`,
`docs/architecture/module-boundaries.md` and `CHANGELOG.md`. Device approval,
exchange, refresh and bearer authentication must consult current account state;
blocked or missing accounts cannot use an existing grant. Verify the real
backend's browser session and tracker batch routes against a temporary SQLite
database, with active-account controls before blocking.

The baseline passed browser/session and browser approval checks but failed four
application checks: exchange, refresh, token-family revocation and tracker
writes. All six real-backend cases now pass, including rejection after an
observed blocked account is unblocked. Existing application protocol, SQLite
repository, tracker and credential-race tests also pass. The current-account
resolver uses an indexed lookup, not a whole-store snapshot. Protocol contracts
are separated from the manager; its existing size limit is preserved.

TypeScript, server compilation, architecture, clean-code, registry and docs
checks pass. Selected auth scans and Semgrep have no findings; Gitleaks finds
no secrets. Next: replace Arena's synthetic fallback percentages with explicit
loading, empty, error and stale real-data states.

## Arena classes increment

Documentation impact: this plan, `docs/specs/arena-classes-data.md`,
`docs/architecture/module-boundaries.md`, both module catalogs and `CHANGELOG.md`.
Move class-statistics loading, validated account-scoped caching and the ranking
board into `src/modules/arenaClasses`. The legacy route keeps its page chrome
and permission gate. Remove both synthetic fallback arrays and the shell's
class-fetch orchestration. Preserve the existing meter presentation; add stories
for loading, real results, empty, error and stale cache. Cached protected data
must be discarded on authorization failure and never be shared across accounts.

Arena verification: deterministic cache/state tests, type checking, production
build, registry, documentation, architecture, clean-code, Semgrep, Storybook
contract/build, agent-tooling and card-motion browser tests pass. React Doctor
0.5.8 reports no findings on changed files. The installed 0.9.13 also finishes
its scan but prints an unrelated setup hint because the script is not named
`doctor`; no setup changes were made.

Chrome DevTools reviewed seven stories at 320, 390 and 1440 pixels (21 renders):
no horizontal overflow, broken images, application console errors or failed
network requests. A Storybook Story Store deprecation warning remains in its
runtime. Observed local LCP was at most 224 ms and CLS below 0.003. Mobile and
desktop screenshots were inspected. Full authenticated/mobile E2E, including
320/390-pixel responsive routes, passed.

The initial JavaScript is 260,031 bytes raw / 81,329 gzip, within unchanged
startup caps. Explicit module splitting lowers the legacy Arena chunk to
73,675 bytes and creates a 7,642-byte classes chunk; both caps are ratcheted to
those measured values. The administrator shell changes only an import from the
entry chunk to vendor-react (+5 bytes, 5,334 to 5,339); its measured cap reflects
that metadata change. App and DeferredRoutes source caps fall to 1,395 and
3,064 lines, and App's function cap falls to 852 lines. No import exceptions or
source-debt allowances were added.

The final build with explicit chunk ownership passed the complete authenticated
and mobile E2E again. The final Storybook build and 21-state Chrome review also
passed after that configuration change. Next: give Battlegrounds hero snapshots
an expiry and a mounted-view retry path so API recovery replaces the snapshot.

## Battlegrounds cache increment

Documentation impact: this plan, `docs/specs/battleground-hero-cache.md`,
`docs/architecture/module-boundaries.md`, the Battlegrounds catalog entry and
`CHANGELOG.md`. Move hero-tier cache ownership into the existing Battlegrounds
module. Live responses expire after five minutes; reserve snapshots expire
after thirty seconds. Mounted consumers retry at expiry, share in-flight
requests and stop callbacks/timers when disposed. A recovered API replaces the
snapshot without reloading the page. Duos must never use a solo snapshot.

The former loader was executed with controlled dependencies: after an API
failure and sixty seconds of simulated time, it still returned the snapshot
and had made only one API request. The new resource passes clock-controlled
expiry, live recovery, concurrent-request, bounded-error-retry and disposal
checks. The React hook also owns filter-specific state, so a newly selected
mode cannot briefly show the previous mode's rows.

Hero contracts, TypeScript, production build and byte budgets, architecture,
clean-code, registry, docs, Semgrep, Knip, parser properties, Sentry privacy,
Storybook contract/build, agent-tooling and hero-motion browser checks pass.
React Doctor has no errors; its one warning concerns the existing two-worker
prefetch loop, whose sequential awaits intentionally limit concurrency.
Chrome DevTools reviewed the live hero-list story at 320, 390 and 1440 pixels:
no overflow, broken images, application errors or failed requests; observed
local LCP was at most 164 ms and CLS below 0.028. Screenshots were inspected.
The Battlegrounds file cap is now 4,101 lines and the tier-list function cap is
229 lines, with no new source-debt or import exceptions. Next: card URL
round-trip, canonical, sitemap and production-monitor consistency.

## Step 5 working contract

Documentation impact: `docs/specs/constructed-card-urls.md`,
`docs/architecture/module-boundaries.md`, this plan and `CHANGELOG.md`.
The client domain owns URL parsing and generation. Server renderers, sitemap
projections and monitoring retain their runtime adapters and share the tested
contract: decode exactly once, validate the identity, encode the segment, and
use a trailing slash in canonical URLs. No visual redesign is introduced.

Step 5 verification: the initial URL-policy, server-canonical and local monitor
regressions failed against the previous implementation; all now pass. TypeScript,
Vite/server build, byte budgets, architecture, test registry, documentation,
clean-code and changed React review pass. Semgrep reports zero findings.
Chrome DevTools reviewed the encoded Blizzard detail at 1440, 390 and 320 pixels:
correct public heading/canonical, no overflow or broken images. The local fixture
uses the actual format metadata shape. External analytics requests are blocked
by the isolated browser allowlist; application requests use controlled responses.
No production endpoint was contacted. Evidence: `/tmp/hp-card-url-browser.json`.
