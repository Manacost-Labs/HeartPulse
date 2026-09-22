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

## Required Multi-Session Coordination

Codex, Claude, and other agents share the repository. Treat one task, one branch,
and one worktree as one ownership unit.

1. Before editing, create an isolated task branch/worktree and run
   `npm run agent:session:preflight`.
2. Never implement directly in the shared `main` worktree. Do not modify,
   clean, reset, stash, delete, or copy uncommitted files from another
   session's worktree.
3. The preflight fetches `origin/main`, lists all linked worktrees, and blocks
   overlapping uncommitted paths. Coordinate directly with the other session
   before either session continues editing those files.
4. Before integration, commit the task changes and run
   `npm run agent:integration:preflight`. It requires a clean task worktree and
   proves that the task branch contains the current `origin/main`.
5. Integrate with a normal fast-forward-safe push. Never force-push `main`.
   If another session advances `main`, fetch and rebase or merge in the task
   worktree, repeat validation, and retry.
6. Only a successful push to `main` may trigger production. Feature-branch
   pushes never deploy. Report the final Git commit and deployed Production SHA
   in the task handoff.

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
- user-visible or maintainer-visible shipped changes: `CHANGELOG.md`.

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

## Required Changelog Post

Every AI agent that changes this project must post a short public update to https://t.me/changelogarena before finishing the task.

Use the local helper from the project root:

```bash
npm run changelog:post -- --version v1.0.0 --text "Коротко: что изменено, что проверено."
```

The helper reads the Telegram bot token from `/etc/hs-arena/hs-arena.env` and posts as `@kolodahearthstoneauthbot` to `@changelogarena`. Do not commit Telegram tokens, copied env files, or secret values.

When the work changes behavior, also update `CHANGELOG.md` under the current version or add a new version section.

## Release Version

The current public version is the first explicit `## v...` heading after
`Unreleased` in `CHANGELOG.md`. Resolve it at posting time; do not hardcode a
second copy in agent instructions. When an unreleased change is posted before
deployment, use that current public version and state clearly that the change is
awaiting integration. Only the release owner creates the next version section.
