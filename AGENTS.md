# HearthPulse Agent Instructions

This repository powers https://hearthpulse.net. The retired
`arena.hs-manacost.ru` host is compatibility-only and is not the active project
identity.

## Parser scrape providers (hs-data-api)

When a task touches the Hearthstone parser / `hearthstone-parses` /
`/srv/hs-data-api` scrape stack, follow that repo's `AGENTS.md` and
`docs/SCRAPE_PROVIDERS.md`. Shared page-scrape order is mandatory:

1. Scrape.do (primary)
2. Firecrawl key rotation
3. Scrapfly (last resort)

Do not invent a Firecrawl-first path for those pipelines.

## Task and Design Context

Use the current user request, repository documentation and supplied visual
references for task scope and design context. External task databases and
design boards are not required to investigate, implement or verify work.

For any tier-rating badge work, read the “Значки тиров — единый стандарт сайта”
section of `assets.md`. All tier-rating badges across the site must use the
bronze shield, tier colour and readable game-font letter implemented by
`TierBadge`, including its compact variant. Do not introduce alternative badge
styles or duplicate its JSX/CSS. Reuse through public contracts and preserve
`docs/architecture/module-boundaries.md` when wiring other domains.

## Required Answer Style

The owner reads every answer and wants it short and to the point. Answer in
the owner's language (Russian):

- Start with the result in one or two sentences: what changed, what was found
  or what is blocked.
- Keep only what the owner needs to act on. Do not retell the process or list
  every command; details belong in PRs, commits and documentation.
- End with `Дальше:` and one to three concrete next steps you propose, the
  recommended one first. Mark the steps that need the owner: a decision, root
  access or money.

## Required Multi-Session Coordination

Codex, Claude, and other agents share the repository. Treat one task, one branch,
and one worktree as one ownership unit. Details and the GitHub settings:
`docs/runbooks/agent-integration.md`.

1. **One worktree per session.** Create a task branch and worktree under
   `/srv/projects/tasks/`, then run `npm run agent:session:preflight`. Never
   implement in the shared `main` worktree; never modify, clean, reset, stash,
   delete, or copy another session's uncommitted files.
2. **File ownership.** Edit only the paths your task owns. The preflight lists
   all linked worktrees and blocks overlapping uncommitted paths; agree on
   exact paths with the other session before either continues.
3. **No shared hot spots.** Do not edit `CHANGELOG.md`: add one
   `changelog.d/<YYYY-MM-DD>-<slug>.md` fragment. Do not edit the bundle
   baselines: growth above the tolerance needs a new file in
   `config/next-bundle-budgets/approvals/` (`docs/runbooks/next-bundle-budgets.md`).
   `agent:integrate` and the pull request CI refuse other edits there. Name a
   new ADR `docs/decisions/YYYY-MM-DD-<slug>.md`; record a local change to a
   vendored kit in `src/vendor/<kit>/patches/<slug>.md`, not in its README.
4. **READY → PR → auto-merge.** Commit the task, then run
   `npm run agent:integrate`. It rebases onto `origin/main`, runs
   `npm run agent:integration:preflight`, pushes the task branch, opens the PR
   and enables auto-merge. The merge queue tests the PR together with the other
   queued PRs and fast-forwards `main`. Never push to `main`, never force-push
   it and never bypass the queue (`gh pr merge --admin`). A red queue run
   removes only the failing PR: fix it on the branch and rerun the command.
   Until the merge queue is enabled on GitHub, the lead session merges the
   READY PR instead.
5. **After the merge.** Only the merge queue updates `main`; its push is the
   only path that may trigger production. Run `npm run agent:integrate --
   --status` until it reports `DEPLOYED`, run the task's production check,
   post the changelog (below), report the PR, merge commit and production SHA,
   and end the session.
6. **No orphaned processes.** Do not leave long-lived dev servers (Storybook,
   `next dev`, watchers, browsers) running. Start them in the background only
   while needed and stop them before handoff; a session that ends with its
   server still listening is not finished.

Dirty sibling worktrees are expected and are reported for awareness; only
overlapping uncommitted paths or an outdated integration base are blockers.

## Required Agent Quality Tooling

The repository includes project-scoped tools for safer implementation:

- Chrome DevTools MCP is declared in `.mcp.json` and launched through
  `scripts/chrome-devtools-mcp.mjs`. Use it for production or local runtime,
  network, console, accessibility, and performance investigation. Keep its
  isolated profile, telemetry/CrUX opt-outs, redacted headers, and URL
  allowlist enabled.
- Before broad source reads, run
  `npm run agent:context -- <module-id-or-path-or-root>` to load a module,
  canonical shared root, checked migration area or the governed project overview, including
  routes, safe starts, focused tests, documentation and current debt.
- Before changing a public page or anything in `apps/public-web`, read
  `apps/public-web/README.md`: the Next.js app map, its import, data-loading,
  SEO and paywall rules, and the recipe for adding a page.
- For nontrivial code reuse, search bounded project source with `context-economy
  retrieve` before expanding reads. The project labels and exact commands are
  in `docs/runbooks/quality-guard.md`; OpenRouter fallback needs an explicit
  evidence gap and opt-in. For a task enrolled in the real-task pilot, begin
  the meter before preparation and record the accepted outcome after checks.
- Run CodeGraph reads through `npm run agent:codegraph -- <read-command>`.
  The wrapper synchronizes a worktree-local index, or reuses the `main` index
  only when both worktrees are clean and point at the same commit. Do not call
  lifecycle commands or override its project path.
- Keep authored `*.test.ts`, `*.test.tsx` and `*.test.mjs` files under `tests/`
  and register each exactly once in `tests/test-suites.json`. The registry gate
  scans the authored repository tree, so a misplaced or unregistered test fails
  validation. Run `npm run test:registry` after adding, moving or deleting
  tests; `npm test` executes the checked registry.
- For authored JavaScript or TypeScript changes, run
  `npm run security:semgrep` before finishing. It scans only changed files and
  is nonblocking while the project baseline is being established. Use
  `npm run security:semgrep:strict` when the task explicitly requires a clean
  strict gate.
- Run `npm run test:agent-tooling` after changing either integration.
- Run `npm run security:gitleaks` before publishing security-sensitive changes.
  Keep the pinned image digest, `--redact`, full-history scan, and artifact/
  comment opt-outs intact.
- Run `npm run quality:knip`, `npm run test:property`, and
  `npm run test:sentry` after dependency, parser-boundary, or telemetry changes.
  The broader `quality:knip:full` report is advisory until its file/export
  baseline is classified.
- Sentry is opt-in only. Never add a DSN or auth token to the repository.
  Preserve `sendDefaultPii: false`, the event scrubber, zero default trace
  sampling, and OAuth-only access to the official Sentry MCP endpoint.
- Storybook is the required component workshop for authored React UI. Before
  creating or changing a story, start `npm run storybook`, use the local
  Storybook MCP at `http://127.0.0.1:6006/mcp` to read its current story
  instructions, and preview every changed state. Add or update a colocated
  `*.stories.tsx` file whenever a reusable component gains a meaningful visual
  state. Before finishing, run `npm run test:storybook` and
  `npm run build-storybook`. Keep Storybook development-only and never expose
  its MCP endpoint through production Nginx.

Do not connect Chrome DevTools MCP to a personal browser profile or enable
unrestricted filesystem paths.

## Required Code and Documentation Contract

All new code and incremental refactoring must follow
`docs/architecture/module-boundaries.md`. The default dependency direction is
`app -> modules -> shared`: composition owns wiring, domain modules own product
behavior, and shared code contains only domain-independent platform primitives.
Do not add new domain behavior to a ratcheted monolith, create catch-all
`utils`/`common` folders, expose module internals across domains, or introduce
an eager application-wide barrel.

Every task must state `Documentation impact` in its working plan before editing:
list the exact documents that need to change, or write `none` with a concrete
reason. Use the owning documentation location:

- module ownership, dependencies or system shape: `docs/architecture/`;
- expensive or hard-to-reverse engineering decisions: `docs/decisions/`;
- public behavior, API, data or permission contracts: `docs/specs/`;
- environment, cache, schedules, deploy, monitoring or recovery:
  `docs/runbooks/`;
- user-visible or maintainer-visible shipped changes: a `changelog.d/` fragment.

Code comments and JSDoc must add information the implementation cannot express
clearly. Explain why a constraint exists, an invariant, a compatibility rule,
or a non-obvious security/performance trade-off. Do not narrate obvious code,
require comments on every function, or leave commented-out code. Add concise
JSDoc to exported module contracts when their semantics, errors, side effects
or ownership are not obvious from types and names.

Source, tests and their documentation must change in the same task and commit.
A pure internal refactor may have no new documentation, but the task must name
the relevant documents reviewed and explain why their contracts stay accurate.
Before handoff, report documentation evidence: updated paths or the explicit
`none` reason. Stale documentation blocks completion.

## Required Skill Routing

The server-wide skills are installed under `/opt/ai-agent-resources` and the
Codex plugin cache. Installing them is not sufficient: agents must select and
read the applicable `SKILL.md` completely before implementation.

The routing step itself is mandatory for every repository task:

1. Read `agent-resource-index` and `agent-skills:using-agent-skills` before
   investigation or implementation.
2. Classify the task against the table below and list the selected skills in
   the working plan. Every matching row is required, not optional.
3. Read every selected `SKILL.md` completely before taking actions governed by
   that skill. Follow its workflow and verification steps; merely mentioning a
   skill does not satisfy this rule.
4. Load only matching skills. Do not read the whole catalog into context when
   it is unrelated to the current task.
5. If a required skill is missing or unreadable, report the blocker and
   continue only when a safe documented fallback exists.

| Task | Required skills/resources |
| --- | --- |
| Every repository task | `agent-resource-index`, `agent-skills:using-agent-skills`, and `agent-skills:context-engineering` |
| Any codebase investigation | `npm run agent:context -- <module-id-or-path-or-root>` before broad source reads; the `codegraph` skill through `npm run agent:codegraph -- explore "<question>"` for worktree-safe navigation; `context7` for current library/framework/API documentation |
| New feature or non-trivial behavior change | `agent-skills:spec-driven-development`; add `agent-skills:planning-and-task-breakdown` when the work has multiple independently verifiable steps |
| Any code implementation | `agent-skills:incremental-implementation` and `agent-skills:test-driven-development` |
| Bug diagnosis or fix | `agent-skills:debugging-and-error-recovery` and `agent-skills:test-driven-development` |
| UI, UX, layout or responsive work | `frontend-design`, TypeUI fundamentals at `/opt/ai-agent-resources/repos/typeui/skills/fundamentals/SKILL.md`, and `agent-skills:browser-testing-with-devtools` |
| React implementation or review | `build-web-apps:react-best-practices` and `build-web-apps:frontend-testing-debugging` |
| API, data contract, parser boundary or external integration | `agent-skills:api-and-interface-design`, `agent-skills:source-driven-development`, and `agent-skills:doubt-driven-development` |
| Performance or loading work | `agent-skills:performance-optimization` plus the audit, performance, Core Web Vitals and accessibility skills under `/opt/ai-agent-resources/repos/web-quality-skills/skills/` |
| Telemetry, errors, metrics or production diagnostics | `agent-skills:observability-and-instrumentation` |
| Source integration or uncertain behavior | `agent-skills:source-driven-development` and `agent-skills:doubt-driven-development` |
| Security, authentication, authorization, secrets, admin access or dependency-risk work | `agent-skills:security-and-hardening` |
| CI, automation or quality-gate work | `agent-skills:ci-cd-and-automation` |
| Migration or deprecation | `agent-skills:deprecation-and-migration` |
| Documentation or architecture decision | `agent-skills:documentation-and-adrs` |
| Commit, branch, merge or release history | `agent-skills:git-workflow-and-versioning` |
| Every completed code change before handoff | `agent-skills:code-review-and-quality` followed by `agent-skills:code-simplification` |
| Production deployment or launch | `agent-skills:shipping-and-launch` |

For every browser-facing change, the agent must perform a real-browser review
with Chrome DevTools MCP after automated checks. The review must cover the
affected viewports, visible overflow or clipping, console errors/warnings,
failed network requests, accessibility structure and relevant performance
signals. A text-only code review is not an acceptable visual verification.

Run `npm run test:agent-tooling` after changing this routing contract.

## Required Changelog

Every user- or maintainer-visible change adds exactly one fragment
`changelog.d/<YYYY-MM-DD>-<slug>.md` (plain Russian text, no heading, no list
marker; see `changelog.d/README.md`). Unique file names never conflict. The
release owner folds fragments into `CHANGELOG.md` with
`npm run changelog:assemble -- --release v1.2.3` (or without `--release` into
`## Unreleased` on demand) in its own PR.

After the change is deployed, every AI agent that changed this project posts the
same fragment to https://t.me/changelogarena:

```bash
npm run changelog:post -- --fragment changelog.d/2026-10-21-merge-queue.md
```

The helper reads the Telegram bot token from `/etc/hs-arena/hs-arena.env` and posts as `@kolodahearthstoneauthbot` to `@changelogarena`. Do not commit Telegram tokens, copied env files, or secret values. Without a
fragment, pass `--text "Коротко: что изменено, что проверено."`.

## Release Version

The current public version is the first explicit `## v...` heading in
`CHANGELOG.md`; `changelog:post` resolves it when `--version` is omitted. Do
not hardcode a second copy in agent instructions. Only the release owner
creates the next version section, with `changelog:assemble --release`.
