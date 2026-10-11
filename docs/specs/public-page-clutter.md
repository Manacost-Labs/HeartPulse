# Compact public statistics pages

## Objective and acceptance

Remove the introductory blocks, duplicate hero heading/source line, related
links and embedded FAQ shown in the owner's screenshots. Apply the same
cleanup to the home page, legendary groups, Battlegrounds tier list/strategy
builder and constructed meta. Keep a single primary heading, navigation,
filters, ratings, access gates and actionable failure/empty notices.
The Arena classes board offers retry only for error and empty states. Cached
class rankings render without a stale-data banner or a refresh button; cache
freshness and fallback behavior remain in the data client.
Help remains available at `/faq/`; home structured data must not claim FAQ
content that is no longer displayed. Page tours must not target removed rows.

## Scope and implementation

Next.js client composition lives in `apps/public-web/ui/`; the legacy Arena
and Battlegrounds views consume domain modules under `src/modules/`.
Use the existing conditional-rendering pattern, for example
`{state.status === 'error' && <p role="alert">…</p>}`. Add no dependencies,
API calls or new shared abstractions. Keep `app -> modules -> shared` ownership.

1. Remove redundant Arena and hero blocks, then check TypeScript.
2. Remove equivalent introductions/FAQ elsewhere; update SEO and tour references.
3. Validate production builds, existing contracts and the five class-board
   stories; review desktop and phone views in the isolated Chrome DevTools MCP.

## Verification commands

- `npm run lint` and `npm run lint:next`
- `npm run test:arena-classes-data` and `npm run test:seo-registry`
- `npx tsx --test tests/seo-structured-data.test.ts`
- `npx tsx tests/home-progressive-loading.test.ts`
- `npm run test:storybook` and `npm run build-storybook`
- `npm run build:static` and `npm run build:next`
- `node --test tests/next-canonical-links-browser.test.mjs`
- `npm run security:semgrep`

Documentation impact: `CHANGELOG.md`, `docs/specs/seo-query-clusters.md`,
`docs/specs/public-home.md`,
`docs/specs/vicious-gold-performance-and-page-tours.md` and this specification.
Reviewed
`docs/architecture/module-boundaries.md` and `apps/public-web/README.md`;
module ownership, API contracts, navigation and permission rules stay accurate.
Commit, push and deployment require the owner's explicit authorization.

## Verified outcome

Production Next.js and Storybook builds, root/Next TypeScript checks, module
boundaries, the test registry, SEO registry/structured data, home loading,
page tours, Next contracts and canonical-link browser tests passed. Semgrep
reported zero findings and zero parse errors on the changed authored files.
The React Doctor wrapper could not scan because this checkout has no local
React Doctor installation; no dependency was added for this content cleanup.

Chrome DevTools MCP reviewed eight changed routes at 1440×900 and 390×844,
with screenshots, accessibility snapshots, console/network inspection and
paint timings. Each retains one H1, has no horizontal document overflow and
renders none of the removed blocks. A subscriber fixture verified the class
ranking without its stale banner or refresh button; the hero Solo/Duos control
changed its pressed state and URL. Five class-board stories cover ready,
loading, empty, error and stale; retry interactions passed for error and empty.
Twelve other main routes were inspected for equivalent repeated blocks.

Browser QA used fixture data. The missing-avatar 404 is deliberate; card-image
and legacy builder APIs are incomplete in this harness, and the Battlegrounds
minion-tier fixture is rejected as belonging to another section. These limit
validation of those unchanged data flows, not the removed introductory UI.
Storybook emitted a framework deprecation warning during retry interactions.
Production data and subscriber sessions were not used for this verification.

Integration uses the normal main-branch validation and immutable-release
deployment workflow. After deployment, the production release SHA must match
the integrated commit, and the affected public pages need a browser check.
The required public update was posted to `@changelogarena` as message 505 under
`v1.0.105`, explicitly marked as awaiting integration.
