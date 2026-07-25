# HS-Arena Agent Instructions

This repository powers https://arena.hs-manacost.ru.

## Required Notion Task Tracking

Every Codex, Claude, or other AI-agent task that concerns
https://arena.hs-manacost.ru or any parser, scraper, ingestion pipeline, source
normalizer, cache, scheduled parser job, or parser administration in this
repository must be recorded in the shared Notion task database:

- Database: https://app.notion.com/p/ae96648273a24b50b687e3af7cefb623
- Database ID: `ae96648273a24b50b687e3af7cefb623`
- Data source ID: `90448a2c-5f1c-4742-928c-c8b5e1b23815`

The task database is the shared source of truth for both Codex and Claude.

1. Before implementation, search the database for the same task and create it
   only when no matching task exists.
2. Set an appropriate `Статус`, `Приоритет`, `Очередь`, `Тип`,
   `Направление`, `Размер`, `Риск`, and `Критерий готовности`. Do not add or
   recreate an assignee/responsible-person property.
3. Keep the Notion status current while working. Record blockers in `Блокер`.
4. Before finishing, add `Git commit` when a commit exists and `Production SHA`
   when the change has been deployed. Mark the task `Готово` only after the
   relevant checks pass and, when requested, production is verified.
5. Never store credentials, tokens, private user data, or other secrets in
   Notion.

Do not silently skip tracking. If the Notion connector is unavailable, report
that as a blocker and record the task as soon as access is restored.

## Required Agent Quality Tooling

The repository includes project-scoped tools for safer implementation:

- Chrome DevTools MCP is declared in `.mcp.json` and launched through
  `scripts/chrome-devtools-mcp.mjs`. Use it for production or local runtime,
  network, console, accessibility, and performance investigation. Keep its
  isolated profile, telemetry/CrUX opt-outs, redacted headers, and URL
  allowlist enabled.
- For authored JavaScript or TypeScript changes, run
  `npm run security:semgrep` before finishing. It scans only changed files and
  is nonblocking while the project baseline is being established. Use
  `npm run security:semgrep:strict` when the matching Notion task explicitly
  requires a clean strict gate.
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
5. If a required skill is missing or unreadable, record the blocker in the
   matching Notion task and continue only when a safe documented fallback
   exists.

| Task | Required skills/resources |
| --- | --- |
| Every repository task | `agent-resource-index`, `agent-skills:using-agent-skills`, and `agent-skills:context-engineering` |
| Any codebase investigation | `codegraph` first when `.codegraph/` exists; `context7` for current library/framework/API documentation |
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

## Required Miro Design Context

The shared Miro board is the persistent source of visual context for ideas,
layouts, user flows, and diagrams:

- Board: https://miro.com/app/board/uXjVGearFGc=/
- Official MCP server: `https://mcp.miro.com/`

For every Codex, Claude, or other AI-agent task involving UI, UX, page layout,
navigation, visual behavior, mockups, or architecture/process diagrams:

1. Read the relevant board context through the official Miro MCP before
   implementation. If the requested frame or area is ambiguous, identify the
   likely relevant frames and ask only when choosing the wrong one would
   materially change the result.
2. Treat Miro as supporting design context. Direct user instructions,
   repository requirements, production data, and verified runtime behavior
   remain authoritative when they conflict.
3. Use Miro read-only by default. Do not create, edit, move, or delete board
   items unless the user explicitly requests that board change.
4. Never copy credentials, tokens, private user data, or secrets into the board,
   repository, prompts, or Notion.
5. If Miro is unavailable, record the blocker in the matching Notion task and
   state whether implementation can safely continue without the missing visual
   context.

## Required Changelog Post

Every AI agent that changes this project must post a short public update to https://t.me/changelogarena before finishing the task.

Use the local helper from the project root:

```bash
npm run changelog:post -- --version v1.0.0 --text "Коротко: что изменено, что проверено."
```

The helper reads the Telegram bot token from `/etc/hs-arena/hs-arena.env` and posts as `@kolodahearthstoneauthbot` to `@changelogarena`. Do not commit Telegram tokens, copied env files, or secret values.

When the work changes behavior, also update `CHANGELOG.md` under the current version or add a new version section.

## Release Version

Current public version: `v1.0.48`.
