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
- `docs/specs/legal-pages.md`: Next support-page rendering and shared content.

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

- [x] Establish typed catalog URL state and navigation regression tests.
- [x] Add allowlisted public catalog seeds and credential-free server loading.
- [x] Integrate catalog hydration, controls, history and route ownership.
- [x] Verify the complete card section with real Express/SQLite, production
      Next, provider fixtures and Chrome DevTools at desktop/mobile widths.
- [x] Migrate and verify the next public page batch.
- [ ] Review, complete gates, commit each verified increment and integrate
      locally after a clean integration preflight.

## Baseline

Started at local main `2c6977b`; session preflight passed. Dependencies installed
with `npm ci`. Another active Battlegrounds worktree edits `CHANGELOG.md`;
coordinate that shared document before editing it. Domain files are disjoint.
Next's official App Router page contract confirms asynchronous `searchParams`
and request-time `fetch(..., { cache: 'no-store' })` for catalog SSR.

Catalog model checks: existing catalog-query tests, strict domain TypeScript and
architecture gates pass. URL tests cover every control, malformed values,
query bounds, reset and campaign-parameter preservation.

Catalog seed checks pass: explicit public-field allowlist, rejection of invalid
identity/format/pagination/status, valid empty results, strict domain and Next
TypeScript. Authenticated behavior remains on the existing Express APIs.

The production Next integration, Vite/Next builds, strict types, all 322
registered files, Storybook contracts/build, architecture and changed-source
clean-code gates pass. Chrome confirms catalog search, table/gallery, page
reload, detail/return, history and subscription/block behavior. The next
public batch is FAQ/privacy/terms, extracting a shared shell for later sections.

Baseline findings outside this change: the full clean-code command reports
existing Home.tsx and publicApi/cards.ts size caps; changed-source scope passes.
React Doctor against the task base reports advisory legacy complexity/state
findings, with no errors. No suppressions or widened budgets were added.

Integrated origin/main `28a4697`, preserving the new aberration icons alongside
the existing hero cache/roster module. Updated the public-export contract test
to include both icon maps; documentation remains accurate in the combined
architecture and Battlegrounds specifications.

## Final page-batch verification

FAQ, privacy and terms now reuse their existing content in Next and share
`PublicPageShell` with cards. `PUBLIC_PAGES_NEXT_ENABLED` controls them
independently; both rollout flags remain off by default. Public catalog seeds
also preserve the existing cropped table thumbnails. The access hook was
renamed to `usePublicAccess` to reflect its shared composition role.

The final registry run passed all 322 registered files (one production email
test remains explicitly excluded). Root/Next/strict-domain TypeScript,
Vite/Next/Storybook builds, Storybook contracts, docs, architecture, dependency
checks and changed-source clean-code pass. Semgrep reports zero findings and
parser errors. React Doctor reports no errors; its remaining warnings cover
legacy complexity, deliberate serial warming, server metadata exports and
invalid-origin configuration throwing before a public fetch.

Chrome DevTools verified all three support pages at 1440, 390 and 320 pixels,
legal cross-links and the mobile menu. Five new Storybook states completed
desktop/mobile interaction plays in isolated pages. Public pages had no
horizontal overflow, failed resources or WCAG A/AA violations. The final card
build repeated search, view/page persistence, refresh, history, detail return,
120-card mobile gallery and subscribed/blocked access checks successfully.
Fixture-only local LCP was 104 ms and CLS was zero; these are not production
performance measurements. No production services or external announcements
were changed.
