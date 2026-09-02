# Score 8 Phase 0: production stability

## Objective

Restore the release signals that currently prevent HearthPulse from reaching a
reliable 8/10 baseline. This phase covers the responsive browser audit, the
Vicious Gold build-enrichment preview route and production data freshness. It
does not redesign product UI or weaken existing availability and freshness
thresholds.

## Baseline

- Source revision: `81050742a1bdb57e6503252131ffb1766a2db631`.
- Unit and integration tests: 241 passing.
- Responsive audit: 99 of 105 scenarios passing.
- Confirmed failures: three anonymous constructed-archetype scenarios wait for
  an obsolete hard-paywall selector; three subscriber Vicious Gold scenarios
  receive HTTP 500 from `/api/vicious-syndicate-gold/builds` in the preview
  transport.
- Production readiness is available but data health is degraded by stale
  `firestone_arena_legendaries_underground` and
  `vicious_syndicate_radars` datasets.

## Required behavior

1. Responsive fixtures model the current access presentation: public teaser
   routes wait for the inline paywall, while genuinely hard-locked routes keep
   using the hard-paywall selector.
2. The deterministic browser preview returns a contract-valid Vicious Gold
   build response and the subscribed page remains usable if enrichment is
   unavailable.
3. Required source datasets refresh through their supported provider pipeline;
   the health monitor continues to report real staleness and is not relaxed to
   obtain a green result.
4. Runtime product request failures remain release-blocking.

## Architecture boundaries

- Keep route fixtures declarative in `config/` and validate them through the
  responsive inventory test.
- Keep API behavior in the server route/domain layer and deterministic browser
  data in the QA fixture layer. Do not add production-only branches for tests.
- Treat the data service as a separate source repository. If it must change,
  follow its own `AGENTS.md`, tests and deployment process.
- Never edit `/var/www` or release copies as source code, expose secrets, or
  silence freshness and runtime-error checks.

## Implementation and commit slices

1. Correct the constructed-archetype readiness contract and lock it with a
   focused inventory test.
2. Reproduce and correct the Vicious Gold preview response with route and
   browser regression coverage.
3. Diagnose the freshness provider/run state and make the smallest source or
   operational correction supported by evidence.
4. Update the runbook and changelog, then run focused, browser, security and
   full project gates.

Each slice is committed independently after its focused checks pass.

## Acceptance criteria

- `npm run test:responsive-inventory` passes and rejects the obsolete
  constructed-archetype selector.
- The full `all-p0` responsive matrix passes all 105 scenarios at 320, 390 and
  768 pixel widths.
- Vicious Gold has no same-origin API 500 in the subscribed browser scenario.
- `/api/health/data` returns healthy after a real successful refresh, without
  threshold changes.
- TypeScript, unit/integration tests, production build, Semgrep, project check
  and required real-browser review pass.
- Operational documentation and `CHANGELOG.md` describe the changed behavior.

## Tooling constraint

Miro is unavailable in the current environment. Work may continue because
Phase 0 does not include visual or layout changes. Any discovery that requires
such a change pauses until the design context is available.
