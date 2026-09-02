# AI project context contract

## Status

Approved for the first architecture-quality increment on 2026-09-02.

## Objective

An AI agent or new maintainer must be able to identify the repository, find the
owning architecture boundary and choose the relevant verification command
without loading the entire codebase. This increment changes documentation and
its contract tests only; runtime behavior and public URLs remain unchanged.

## Canonical identity

- The engineering project and repository are named **HearthPulse**.
- The canonical public application origin is `https://hearthpulse.net`.
- `arena.hs-manacost.ru` is a retired compatibility host, not the active
  project identity.
- The public interface may continue to use the Manacost Arena product brand.
- The existing npm package name remains unchanged in this increment.

## Required focused map

`docs/architecture/ai-project-map.md` is the first architectural document an
AI agent should load after `AGENTS.md`. It must stay at or below 200 lines and
contain:

1. canonical project identity and the compatibility distinction;
2. primary frontend, backend and composition entry points;
3. the enforced `app -> modules -> shared` dependency direction;
4. the difference between catalogued modules and legacy transitional areas;
5. commands for module, route, file-impact and focused-test discovery;
6. guidance for selecting the smallest relevant context and verification set;
7. links to the authoritative boundary, catalog, migration and agent-tooling
   documents;
8. explicit high-risk and generated/runtime areas that must not be edited as
   source.

The map is a navigation layer. It links to sources of truth instead of copying
their complete rules, inventories or runbooks.

## Contract checks

`npm run test:agent-tooling` must fail when:

- the active instructions no longer identify HearthPulse and
  `https://hearthpulse.net`;
- the focused map is missing or exceeds 200 lines;
- the map omits the required entry points, dependency direction, navigation
  commands, verification guidance or authoritative links.

The test may mention the retired host only to verify its compatibility role. It
must not forbid historical migration documentation or compatibility tests.

## Compatibility and rollback

This increment must not modify application source, route manifests, API
contracts, environment variables, deploy scripts or production topology. A
rollback is the normal revert of the documentation and contract-test commits;
no data migration or production recovery action is required.

## Acceptance criteria

- Active engineering instructions use the canonical identity and domain.
- The focused AI project map satisfies every required section and the line
  budget.
- README, CONTRIBUTING and agent-tooling navigation point maintainers to the
  same project context without rewriting the visual product brand.
- Agent-tooling, documentation-truth, documentation lint and architecture gates
  pass.
- The repository contains no runtime behavior change from this increment.
