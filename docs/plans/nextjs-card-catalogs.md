# Next.js card catalogs and following pages

## Scope and acceptance

Complete the existing card pilot on `codex/nextjs-cards-20260923`: Next owns
`/standard/cards/`, `/standard/cards/standard/`, `/standard/cards/wild/` and
their existing details when the reversible flag is enabled. Public catalog
HTML contains real cards, metadata and pagination. Search, every existing
filter, sort, gallery/table view, period/rank and page size survive refresh
and navigation. Empty results, upstream failure/retry and authoritative detail
404s remain distinct. Paid statistics are loaded only through authenticated
Express APIs; no credentials or private data enter server seeds.

Continue with an independently verified set of other public pages after the
card section. Preserve current UI, URLs, APIs and browser interactions.
Production activation and external announcements remain outside this phase.

## Documentation impact

- This plan: acceptance, increments and verification evidence.
- `docs/specs/constructed-card-urls.md`: catalog query/navigation contract.
- `docs/specs/public-card-read-model.md`: anonymous catalog SSR projection.
- `docs/architecture/module-boundaries.md`: catalog model/hook ownership.
- `docs/runbooks/nextjs-public-web.md`: route ownership and verification.
- `CHANGELOG.md`: completed card migration and subsequent page batch.
- Owning public-page specs when subsequent routes change ownership.

## Workflow and selected skills

Use the resource-index, using-agent-skills and context-engineering workflows;
CodeGraph through the worktree wrapper and Context7 for Next documentation.
Reuse the skills already read in this task: spec-driven-development,
planning-and-task-breakdown, incremental-implementation, test-driven-development,
api-and-interface-design, source-driven-development, doubt-driven-development,
security-and-hardening, frontend-design, TypeUI fundamentals,
browser-testing-with-devtools, build-web-apps react-best-practices and
frontend-testing-debugging, documentation-and-adrs, git-workflow-and-versioning,
code-review-and-quality and code-simplification. Deprecation-and-migration was
refreshed for this phase. Review locally; do not spawn agents.

## Increments

- [ ] Establish typed catalog URL state and navigation regression tests.
- [ ] Add allowlisted public catalog seeds and credential-free server loading.
- [ ] Integrate catalog hydration, controls, history and route ownership.
- [ ] Verify the complete card section with real Express/SQLite, production
      Next, provider fixtures and Chrome DevTools at desktop/mobile widths.
- [ ] Migrate and verify the next public page batch.
- [ ] Review, complete gates, commit each verified increment and integrate
      locally after a clean integration preflight.

## Baseline

Started at local main `2c6977b`; session preflight passed. Dependencies installed
with `npm ci`. Another active Battlegrounds worktree edits `CHANGELOG.md`;
coordinate that shared document before editing it. Domain files are disjoint.
Next's official App Router page contract confirms asynchronous `searchParams`
and request-time `fetch(..., { cache: 'no-store' })` for catalog SSR.
