# Agent Skills Index

This file is a navigation aid for agents working on HearthPulse. It does not
copy or replace the canonical `SKILL.md` files; agents must read the selected
canonical skill before taking actions governed by it.

## Canonical locations

<!-- markdownlint-disable MD013 -->

| Area | Skill | Canonical file |
| --- | --- | --- |
| Every task | `agent-resource-index` | `/home/debian/.codex/skills/agent-resource-index/SKILL.md` |
| Every task | `agent-skills:using-agent-skills` | `/home/debian/.codex/skills/agent-using-agent-skills/SKILL.md` |
| Every task | `agent-skills:context-engineering` | `/home/debian/.codex/skills/agent-context-engineering/SKILL.md` |
| Planning | `agent-skills:planning-and-task-breakdown` | `/home/debian/.codex/skills/agent-planning-and-task-breakdown/SKILL.md` |
| Specs / new behavior | `agent-skills:spec-driven-development` | `/home/debian/.codex/skills/agent-spec-driven-development/SKILL.md` |
| Implementation | `agent-skills:incremental-implementation` | `/home/debian/.codex/skills/agent-incremental-implementation/SKILL.md` |
| Tests | `agent-skills:test-driven-development` | `/home/debian/.codex/skills/agent-test-driven-development/SKILL.md` |
| Debugging | `agent-skills:debugging-and-error-recovery` | `/home/debian/.codex/skills/agent-debugging-and-error-recovery/SKILL.md` |
| API / parser boundary | `agent-skills:api-and-interface-design` | `/home/debian/.codex/skills/agent-api-and-interface-design/SKILL.md` |
| External sources | `agent-skills:source-driven-development` | `/home/debian/.codex/skills/agent-source-driven-development/SKILL.md` |
| Security | `agent-skills:security-and-hardening` | `/home/debian/.codex/skills/agent-security-and-hardening/SKILL.md` |
| Browser QA | `agent-skills:browser-testing-with-devtools` | `/home/debian/.codex/skills/agent-browser-testing-with-devtools/SKILL.md` |
| Documentation | `agent-skills:documentation-and-adrs` | `/home/debian/.codex/skills/agent-documentation-and-adrs/SKILL.md` |
| Review | `agent-skills:code-review-and-quality` | `/home/debian/.codex/skills/agent-code-review-and-quality/SKILL.md` |
| Simplification | `agent-skills:code-simplification` | `/home/debian/.codex/skills/agent-code-simplification/SKILL.md` |
| Git history | `agent-skills:git-workflow-and-versioning` | `/home/debian/.codex/skills/agent-git-workflow-and-versioning/SKILL.md` |
| CI / automation | `agent-skills:ci-cd-and-automation` | `/home/debian/.codex/skills/agent-ci-cd-and-automation/SKILL.md` |
| Release / production | `agent-skills:shipping-and-launch` | `/home/debian/.codex/skills/agent-shipping-and-launch/SKILL.md` |

<!-- markdownlint-enable MD013 -->

Additional skills are available under `/home/debian/.codex/skills/` and
`/home/debian/.codex/plugins/cache/`; use the project routing table in
`AGENTS.md` to select only those matching the task.

## HearthPulse routing shortcuts

- Parser, scraper, ingestion, or source normalizer: API/interface design,
  source-driven development, doubt-driven development, and the parser repo's
  own `AGENTS.md` plus `docs/SCRAPE_PROVIDERS.md`.
- React or browser-facing UI: frontend design, TypeUI fundamentals, browser
  testing, and the applicable React testing/best-practices skills if installed.
- Bug fix: debugging, TDD, then review and simplification before handoff.
- Deployment or production change: shipping/launch, CI/CD, git workflow, and
  the repository's deployment/runbook requirements.
- Documentation-only change: documentation-and-adrs; update the owning
  document and state documentation impact in the working plan.

## Canonical roots

- Shared resource index: `/opt/ai-agent-resources/`
- Shared repositories: `/opt/ai-agent-resources/repos/`
- Plugin cache: `/home/debian/.codex/plugins/cache/`

If a listed skill is missing or unreadable, record that as a blocker and use a
documented fallback only when the task can proceed safely.
