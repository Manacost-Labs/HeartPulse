# Public navigation stability

## Cancellable intent and pending feedback (2026-10-12)

The public adapter now waits for 120 ms of pointer intent; abandoning a link
cancels the timer. Keyboard focus remains immediate. Touch, hidden documents,
offline, Save-Data and 2G skip speculative reads, while explicit navigation
still works. Current-page intent does not prefetch. Freshness markers are
bounded to 32 and versioned so an evicted route's old invalidation cannot
remove a newer marker. All adapter timers/listeners have mounted lifetimes.

Anchors and callbacks share one React transition. After 200 ms the shared
`NavigationProgress` status shows a gold line and announces loading; it changes
no page geometry, intercepts no input and stops when the transition completes.
Reduced motion uses a static line. The next destination can supersede a slow
route. Session verification and existing error/reload recovery are retained.

The transient-hover browser regression made one speculative route request
before the change and zero afterwards. With a 900 ms local RSC delay it checks
the old content position, persistent menu, status completion, Save-Data,
rapid replacement and Back. These are deterministic lab contracts, not a
field Web Vitals speed claim. Unit coverage checks cancellation/disposal,
network policy, nested pointer events and invalidation after marker eviction.

The canonical-card browser contract distinguishes RSC intent from the existing
120 ms card-render warmup: hovering may fetch that card's full image once,
but must not mount the destination or issue client requests for page data.

Verification uses dependencies installed from `package-lock.json` in the task
worktree. A shared `node_modules` can lag behind the locked Next version and
underreport bundle size. The published 16.3.8 guest tier-list is 164,772 gzip
bytes; navigation feedback and intent bring the combined release to 165,512
bytes in CI. Its reviewed ceiling follows the existing 2% margin/1 KiB rule
documented in `docs/specs/public-page-headers.md`.

Archetype QA scrolls the main build into view before awaiting its lazy render.
On phones the preceding statistics can put it outside the observer margin.

Authenticated shell waits use the first focusable control; the keyboard
smoke checks Tab/Enter focus and destination. The persistent-root DOM order
has its own transition regression.

The owning spec is `docs/specs/public-client-navigation.md`. Review the
production-build navigation tests and existing bundle budgets before pushing;
use the normal immutable main/CI deployment and observer gates. Rollback is a
normal revert of the task commit through the same pipeline; there is no data
migration or runtime configuration to reverse.

Status: implemented in `codex/navigation-stability-20261005`; the owner
authorized integration and production deployment on 2026-10-05. The immutable
release is identified by this change's Git commit and verified by the
production monitor after CI deployment. Base: `3e4cf5ec228495014a5d63b1f66d3d03c53cd5a2`.

## Problem and change

Public `navigate()` previously called `window.location.assign()`. Every page
created its own `PublicPageShell` and menu state. The desktop sidebar returned
to its initial scroll and closed its groups. A cross-document fade-through
also faded out the old content before revealing the next page, creating a
visible flash even when the server was fast.

The Next root layout now owns the actual navigation DOM and one viewer-access
provider. App Router replaces route content while the menu remains mounted.
Legacy callbacks and eligible real anchors use the same adapter; intent
prefetch fetches RSC rather than running another document. The document
transition, entrance script and hidden-document speculation rules are removed.
Standalone page shells still render navigation for component previews.

The access context holds a stable per-document snapshot store instead of the
changing profile object. React context propagation had invalidated a dehydrated
home article boundary when the account check finished before its chunk loaded.
Hydrated readers subscribe through `useSyncExternalStore`; the SSR snapshot is
the initial guest state, and verified changes publish in a layout effect before
paint. Revocation is synchronous, without a transition or delayed grant update.
The snapshot contract follows [React's SSR store guidance](https://react.dev/reference/react/useSyncExternalStore).

Mobile links close the drawer synchronously before navigating, releasing the
body scroll lock before Next records the history entry. The desktop scroll
and expanded groups persist. Modified clicks, downloads, external links,
fragments, APIs, identity, referral and admin links retain native navigation.
Malformed destinations do not throw during hover prefetch.

Access is quietly reverified on pathname changes and on bfcache restore;
account changes or failed verification hide paid grants. Request generations
prevent an older session/subscription answer from restoring a previous viewer.
The API payloads and server authorization checks are unchanged. Existing
Plausible tracking observes History API navigation automatically; the document
loads its script once, without additional pageview calls. This was checked
against the installed tracker and [Plausible's SPA contract](https://plausible.io/docs/spa-support).

## Verification, 2026-10-05

- Next production build and TypeScript check.
- Navigation/import/Express/search-parameter contracts: 18 tests.
- Browser navigation, drawer, bfcache/access and document-head contracts:
  7 tests, including native links without JavaScript, actual Ctrl-click,
  RSC navigation without a new document, menu DOM identity/scroll/groups,
  mobile lock release and Back position, revoked access and account switching.
- Registered tests and architecture/debt/catalog/route-manifest gates.
- Slow-chunk home hydration: server-rendered articles stay visible while the
  guest profile check finishes, with the article chunk deliberately held.
- Browser observatory checks the first skip link at the persistent Next root
  or standalone shell, then retains its viewport, sticky and keyboard checks.
- Changed-source Semgrep: zero findings and parser errors.
- Storybook MCP instructions and story discovery; ten affected desktop/mobile
  states reviewed in the browser. The persistent-menu stories exercise route
  changes and drawer closing. Storybook contracts and production build pass.
- Bundle budgets, dependency-only Knip, property checks and Sentry/privacy
  checks pass. React Doctor reports five advisory warnings: the real anchors
  intentionally retain native fallback while the adapter is mounted; context
  reads follow the existing React convention. No suppressions were introduced.

Chrome DevTools used its isolated profile, the project URL allowlist and
header redaction. App review covered 1440px desktop and 390px phone widths,
visible clipping/overflow, console, network and accessibility structure.
There was no horizontal overflow or application console error. The existing
unused CSS-preload warning remains; it also occurred in the production baseline.

## Performance evidence and limits

| Local production build, guest | Desktop | Phone, CPU 4x |
| --- | ---: | ---: |
| Click to committed route, observed frames | 64 ms | 116 ms |
| Interaction duration reported by Chrome trace | 39 ms | 56 ms |
| Observed CLS | 0.00 | 0.00 |
| Menu DOM preserved on every sampled frame | yes | yes |
| Content opacity on every sampled frame | 1 | 1 |

These are single local Chrome samples with a fixture backend and no network
throttling. They are not field INP, a cross-browser benchmark or a production
speed guarantee. The older cold production phone sample had LCP 1556 ms and
TTFB 925 ms; its remote network/server conditions differ, so it is not used
as a before/after comparison with these local route samples.

The shared adapter adds some initial JavaScript. The reviewed home build has
about 159–160 KiB gzip JavaScript and 34 KiB CSS. Only exceeded JavaScript ceilings
were rounded up to the next KiB in `config/next-bundle-budgets.json`; existing
CSS ceilings and already sufficient JavaScript ceilings were retained. The
stable access store adds approximately 150 bytes gzip to the shared runtime;
three newly exceeded ceilings were rounded up by the same next-KiB rule.
The CI build measured about 0.6 KiB more shared JavaScript than the local build;
the thirteen ceilings exceeded in CI were likewise rounded to the next KiB.
Both builds remain covered by the same route budgets; CSS limits are unchanged.
The tradeoff is paid once per document; client routes reuse the runtime and menu.
First-visit server latency, DNS/TLS and legacy view hydration still need their
own measured work if cold loading remains slow. Application cache and deployment
gates remain unchanged. Before publishing, the root-managed edge sync and monitor
configuration was aligned with the existing Moscow/Novosibirsk DNS topology:
the disconnected Limburg host had caused the previous deployment to fail after
the application release was activated. Both active edges passed the regional
monitor and static synchronization. See
`docs/runbooks/hearthpulse-domain-migration.md` for the configuration and backup.

## Documentation and public update

Updated documentation: `apps/public-web/README.md`,
`docs/specs/public-client-navigation.md`,
`docs/architecture/module-boundaries.md`,
`docs/runbooks/hearthpulse-domain-migration.md`, this runbook and `CHANGELOG.md`.
The required public update is [Telegram message 502](https://t.me/changelogarena/502),
posted under the current release version with an explicit awaiting-integration
notice. It does not announce a production deployment.

## Repeat the checks

### Follow-up: group layout and prefetch freshness

Final production review also reproduced a clipped mobile header: opening
the drawer at scroll 600 moved the sticky top bar to -600px while the body
was fixed. The scroll lock now exposes the saved offset through an inherited
CSS property; the sticky header compensates with translation. The existing
fixed-body mechanism and nested lock lifetime remain in place. Unlock restores
the original property value and priority. The mobile browser regression fails
on the previous build and verifies the header at 0px, the visible close button,
inline style restoration and Back at scroll 600. The scrolled-drawer Storybook
state exercises closing and reopening without navigation.

The local build verifies header top 0px while locked at scroll 600 and restores
scroll 600 and the absent CSS property after close; it has no horizontal
overflow. The header fix adds 68 gzip bytes to the local home runtime
(162931 → 162999). The active release's `/legendaries/` runtime measured
189393 bytes against a 189440-byte ceiling, so its JavaScript ceiling alone
is rounded to 190464 for this reviewed addition. Other JavaScript and all CSS
ceilings are retained; the existing budget test passes. These are asset sizes
and single browser checks, not field performance scores.

The 2026-10-05 production phone sample (390×844, CPU 4x) showed a second
109px control movement around 108ms after switching groups: the old group
kept 106px of height during its discrete display transition. Group display
now changes immediately; appearance still uses the shared motion tokens.
The drawer's popover and scroll-lock behavior is preserved for iOS and Back.

The permanent prefetch set now follows Next's `onInvalidate` callback.
Repeated intent reuses a fresh request, stale intent can prepare a new one,
and invalidation alone starts no request. A synchronous speculative failure
allows a later retry. Desktop/closed-drawer transitions skip the unnecessary
`flushSync`; open-drawer transitions still close synchronously.

Regression coverage: `tests/next-navigation.test.ts` exercises fresh/stale
intent and failure/retry; `tests/next-page-transitions-browser.test.mjs`
checks zero closed-group geometry and no delayed control movement on desktop
and mobile, together with its existing navigation/history/native-link checks.
Persistent navigation stories exercise group switching before route changes.

Local production-build review at 390×844/CPU 4x sampled 15 frames after a
group switch: the closed group's height was zero throughout, and the control
had zero subsequent movement. Mobile FAQ→tierlist kept the document and menu,
closed the drawer, and Back restored scroll 600→600. The observed transition
was 147ms in the local fixture, not a production speed comparison or field INP.
All four focused navigation/mobile/head/canonical browser tests passed;
Next contracts (20), motion tokens (3), shell, TypeScript, architecture,
Storybook build/contracts, existing bundle budgets and documentation gates
passed. Changed-source Semgrep found no issues. Desktop and mobile persistent
stories were visually reviewed; no overflow or application console error was
found. The pre-existing unused CSS preload warning remains. A separate
read-only review found no required corrections.

The first follow-up CI passed the full browser observatory but measured
cosmetics JavaScript at 171045 bytes against a 171008-byte ceiling (37 bytes
over). Only that ceiling was rounded to the next KiB, 172032; CSS and every
other route ceiling are retained. Home JavaScript in that CI was 163576 bytes,
45 bytes above the prior CI sample. The bridge then dropped a redundant URL
parse: `clientPagePath` already returns a canonical relative path, so current
path/query fragments can be compared directly. Native fragment navigation
has a browser regression check. The router's documented prefetch method is
passed directly, avoiding an extra wrapper. The final local home measurement
was 162931 bytes, cosmetics 170458. Local/CI differences prohibit treating
these as a before/after speed comparison; the route budget remains a checked
upper bound rather than a claim about field performance.

Documentation impact: this runbook, `docs/specs/public-client-navigation.md`
and `CHANGELOG.md`. The public-web README and architecture contract remain
accurate: no route, access rule, data contract or ownership boundary changed.

```sh
npm run agent:session:preflight
npm run build:next
npm run lint:next
npm run lint:architecture
npm run test:next-contracts
npm run test:registry
node --test --test-concurrency=1 \
  tests/next-page-transitions-browser.test.mjs \
  tests/next-mobile-menu-browser.test.mjs \
  tests/next-bfcache-browser.test.mjs \
  tests/next-document-head-browser.test.mjs
npm run budget:next
npm run security:semgrep
npm run test:storybook
npm run build-storybook
```

Start the local gateway on allowed port 3000 and repeat the menu transitions
through Chrome DevTools MCP. On mobile, scroll a page before opening the drawer,
follow a link, then use Back. On desktop, expand a group, scroll the sidebar,
and confirm its DOM/scroll remain unchanged after navigation. Review browser
console/network and the target page's metadata. Keep Chrome protections enabled.

With the owner's commit/push/deploy authority, commit in this task worktree,
run integration preflight on the clean branch and integrate
through the normal pipeline and report the resulting commit and Production SHA.
A public changelog post for this unreleased task must say it awaits integration.

## Full intent preparation and soft content settlement (2026-10-13)

Task branch: `codex/smooth-navigation-speed-20261013`. The task worktree is
`/home/debian/.codex/worktrees/smooth-navigation-speed/arena.hs-manacost.ru`.
The fetched integration base and task HEAD are
`a25fb04889f426112bd52896059653771bd5dc15`. Changes await integration;
this task has no new commit or Production SHA and performed no push or deploy.

Next 16.3.8's default `AUTO` prefetch left the dynamic page's content for
the click. The public adapter now requests `full` preparation on qualified
pointer/focus intent. The existing 120 ms intent delay, cancellation,
Save-Data/offline/2G/touch policy and invalidation remain in force.
The Next-specific option stays in the public adapter rather than shared code.

After a pathname commits, shared `RouteTransition` animates only the marked
content from opacity 0.8 to 1 using the existing 220 ms motion token and ease.
It preserves child identity, cancels superseded motion, leaves the first paint
untouched and skips reduced motion, hash/query changes and same-route updates.
The menu and utility header remain outside the effect; navigation never waits
for an exit animation. No additional stylesheet or animation dependency is used.

### Measurements and verification

The before/after production-build fixture used three fresh desktop contexts,
1440×900, a 450 ms delay on each RSC request, FAQ→guides and 1700 ms of hover
preparation. Click-to-committed-content samples were 499/491/496 ms before
and 44/55/43 ms after (medians 496→44 ms). Each old click issued another RSC
request; each new click issued zero. Both runs issued three speculative RSC
requests before clicking. This isolates a prepared navigation benefit and does
not measure first-visit speed, field INP or production user traffic.

Local warm-cache FAQ traces recorded LCP 101→184 ms, TTFB 4→5 ms and CLS 0→0
without throttling. These single traces support no LCP improvement claim.
Cold baseline Next build was 18.379 s; the final warm build was 9.469 s.
Cache conditions differ, so this task makes no build-time improvement claim.

The final budget check passed. Archetypes JavaScript measured 191563 gzip
bytes (75 bytes over its old ceiling); classes measured 169135 (175 over).
Only these two ceilings use the existing reviewed 2% margin/1 KiB rule:
195584 and 173056 respectively. All other JavaScript and all CSS limits stay
unchanged. The shared motion introduces a small runtime cost.

Passed checks:

- static and Next production builds; TypeScript and ordinary lint;
- architecture, Next contracts, motion tokens and test registry;
- seven focused browser tests for navigation, hydration, head and access;
- existing bundle budgets; changed-source Semgrep with zero findings;
- changed React diagnostics; Storybook contracts and production build;
- changed-document Markdown checks and `git diff --check`.

The browser suite covers full dynamic prefetch before click, committed motion,
initial paint, reduced motion, slow/rapid navigation, history and native links.
No new test file or registry entry was needed. The historical changelog is
excluded from the repository Markdown gate; its unrelated legacy violations
were left intact. The complete repository release gate was not run.

Chrome DevTools MCP reviewed the local production fixture at 1440×900 and
390×844 (mobile CPU 4x), including menu navigation and Back. No horizontal
overflow, clipped primary controls, failed resources or application JavaScript
errors were observed. Each page has one H1 and one main landmark. One existing
Chromium warning about unused prefetched Next CSS remains; a direct desktop
load had no console warnings. All four new stories and the five affected shell
stories were previewed in the real browser without visible Storybook errors.
Isolation, header redaction, telemetry opt-outs and URL/filesystem limits were
kept enabled throughout the review.

Storybook previews on the task's own development port:

- <http://localhost:6026/?path=/story/shared-routetransition--initial>
- <http://localhost:6026/?path=/story/shared-routetransition--navigation>
- <http://localhost:6026/?path=/story/shared-routetransition--rapid-replacement>
- <http://localhost:6026/?path=/story/shared-routetransition--same-route>
- affected stories: <http://localhost:6026/?statuses=affected;modified;new>

### Changed files and integration ownership

Documentation impact: this runbook, the navigation spec, public-web README
and Unreleased changelog. `docs/architecture/module-boundaries.md` was reviewed;
its ownership rules remain accurate because the effect is a domain-independent
shared primitive and Next-specific preparation remains in app composition.

- `apps/public-web/ui/PublicNavigationBridge.tsx`
- `apps/public-web/ui/PublicNavigationLayout.tsx`
- `src/app/shell/PublicPageShell.tsx`
- `src/shared/ui/RouteTransition.tsx`
- `src/shared/ui/RouteTransition.stories.tsx`
- `tests/next-page-transitions-browser.test.mjs`
- `config/next-bundle-budgets.json`
- `apps/public-web/README.md`
- `docs/specs/public-client-navigation.md`
- `docs/runbooks/public-navigation-stability.md`
- `CHANGELOG.md`

Session preflight passed before implementation. During work, README/changelog
edits overlapped `archetype-polish-20261013` and
`unified-table-card-tiles-20261013`; further edits to those documents were
frozen. The final integration preflight fetched an unchanged `origin/main`
and blocks the dirty task worktree plus the remaining changelog overlap with
`unified-table-card-tiles-20261013`. No sibling files were modified or copied.
The coordination chat
«Проверить сессии Codex» must reconcile those document hunks and preserve
previous tasks before committing/integrating this branch.

Before any release, the coordinator must fetch and include current
`origin/main`, rerun affected checks and integration preflight on a clean task
branch, and confirm the previous release's Production SHA. Main push and
deployment remain exclusively with that coordinator. This runbook records
reviewed local results rather than authorizing publication or deployment.

The mandatory public update was posted as the current version `v1.0.106`,
explicitly awaiting integration: <https://t.me/changelogarena/539>.
The helper used the existing server environment through passwordless sudo;
no secret value or copied environment file was exposed or stored in the task.

## Bounded home recovery and shared soft arrivals (2026-10-13)

This continuation stays in `codex/smooth-navigation-speed-20261013` at
`/home/debian/.codex/worktrees/smooth-navigation-speed/arena.hs-manacost.ru`.
It preserves the preceding full intent preparation and route-transition work.
No task commit, main push or deployment has been made; integration remains with
«Проверить сессии Codex».

### Confirmed problems and resulting behavior

The home document previously awaited both feeds, each with a ten-second
ceiling. A controlled articles response delayed by 1800 ms held the complete
document: the failing regression measured TTFB 2108 ms. Both reads now share
one 600 ms first-paint budget. A fast summary survives a slow articles feed;
only missing feeds recover in the browser. Successfully empty articles remain
`[]` and issue no retry. Account pages mount no home recovery hooks.

The final browser suite measured 599 ms of server feed wait and 936 ms TTFB;
an isolated follow-up run measured 596 ms and 925 ms respectively. Next startup
and concurrent verification contribute to total TTFB, so these observations
prove the bounded dependency wait, not a production percentage improvement.
No field LCP/INP or build-time improvement is claimed.

Shared first-paint reads now start no request after expiry and forward aborts
through the anonymous Express adapter. Expiry cancels held headers and JSON
bodies rather than merely discarding their eventual result. Browser recovery
is cancelled when leaving home; a lazy recovery chunk arriving after its
10-second lifetime cannot issue a stale request. That lifetime includes code
loading and body parsing, preventing an indefinite loading placeholder.
An additional held-503-body regression reproduced one live browser connection
after failure (only the server read cancelled). Browser error responses now
cancel their unread body immediately; the check requires both reads to release
their connections within one second rather than waiting for the HTTP deadline.

Nonurgent feed updates preserve streamed sections while their visual chunk
loads. Only a pending feed settling uses the same 220 ms opacity 0.8→1 effect
as committed routes. Prepared content has no entrance animation; reduced
motion skips both effects. The home module supplies two explicit DOM ports,
so app composition does not depend on private module CSS. Shared motion owns
no product data and adds no animation library or layout offset.

Recovery request code is loaded only for incomplete responses. Moving it out
of the initial home bundle reduced JavaScript gzip from 167273 to 166117 bytes
(1156 bytes); a fresh-context browser check confirms prepared pages never
request that chunk. No further budget increase was needed:

| Route | Final initial JS gzip, bytes | Existing task ceiling, bytes |
| --- | ---: | ---: |
| `/` | 166117 | 167936 |
| `/standard/archetypes/` | 191616 | 195584 |
| `/classes/` | 169188 | 173056 |

The two changed ceilings belong to the preceding measured route-transition
phase. All other JS and all CSS ceilings remain unchanged. There is no new
dependency, global data cache, parser or telemetry change.

### Final verification and browser evidence

Passed on the final implementation:

- Next production build, ordinary and Next TypeScript lint, architecture gates;
- 24 Next contracts, first-paint loader contracts and motion-token checks;
- eight browser tests covering hydration, navigation, document head and access;
- bundle budgets, Storybook contracts and static Storybook build;
- changed React diagnostics: 18 files, no issues;
- changed-source Semgrep: 20 files, zero findings or parser errors.
- changed-document Markdown checks and `git diff --check`.

Test registry (22 checks) and agent tooling (62 checks) also passed after
adding Storybook app composition discovery. The continuation uses existing
registered test files. Tests reproduce slow feeds, expired reads, held bodies,
lazy section preservation, cancellation on client navigation, no home reads on
account pages, no duplicate fast-feed reads and expired lazy code. The complete
repository release gate was not run.

Chrome DevTools MCP reviewed the final local production fixture at 1440×900
and 390×844 with mobile CPU 4x. Both have document width equal to viewport,
no clipped primary controls, one H1 and one main landmark, zero console
errors/warnings and zero failed resources (39/38 requests respectively).
All six recovery stories and four route-transition stories were reviewed in a
real browser; missing/failed feeds also received mobile review. No Storybook
error surface or horizontal overflow was observed. The empty and failure
messages retain the existing module behavior.

The final warm-cache diagnostic trace recorded local mobile LCP 248 ms,
TTFB 13 ms and CLS 0; production mobile LCP 845 ms, TTFB 449 ms and CLS 0.
These use different data/network/cache conditions and are not a before/after
comparison. Network throttling was unavailable with the required URL guard;
CPU emulation worked. The isolated profile, URL/filesystem restrictions,
header redaction and telemetry opt-outs stayed enabled.
The final local trace is `/tmp/smooth-followup-final-mobile-trace.json.gz`.

Final screenshots: `/tmp/smooth-followup-final-desktop.webp`,
`/tmp/smooth-followup-final-mobile.webp` and
`/tmp/smooth-followup-final-story-{missing-both-feeds,failed-feeds}.webp`.
Check logs use `/tmp/smooth-followup-*.log`; the final browser suite is
`/tmp/smooth-followup-browser.log`. These are local evidence, not release
artifacts. Development Storybook remains on the task's own port 6026:

- <http://localhost:6026/?path=/story/home-first-paint-recovery--server-prepared>
- <http://localhost:6026/?path=/story/home-first-paint-recovery--missing-articles>
- <http://localhost:6026/?path=/story/home-first-paint-recovery--missing-both-feeds>
- <http://localhost:6026/?path=/story/home-first-paint-recovery--failed-feeds>
- <http://localhost:6026/?path=/story/home-first-paint-recovery--leave-during-loading>
- all affected states: <http://localhost:6026/?statuses=affected;modified;new>

Code review followed by simplification checked stable SSR props, `null` versus
empty data, bounded cancellation, lazy-code expiry, animation cleanup and
`app -> modules -> shared` ownership. The implementation reuses validators,
HTTP deadlines and motion tokens rather than adding a second loading system.

### Changed files and documentation handoff

Full task list, including the preceding phase (30 paths):

- `.storybook/main.ts`
- `CHANGELOG.md`
- `apps/public-web/README.md`
- `apps/public-web/lib/expressApi.ts`
- `apps/public-web/lib/publicArchetypeCatalogTeaser.ts`
- `apps/public-web/lib/publicCosmeticsCatalog.ts`
- `apps/public-web/lib/publicFirstPaintRead.ts`
- `apps/public-web/lib/publicFunDecksPreview.ts`
- `apps/public-web/lib/publicHome.ts`
- `apps/public-web/lib/publicStandardMetaTeaser.ts`
- `apps/public-web/ui/HomePageClient.tsx`
- `apps/public-web/ui/HomePageContent.stories.tsx`
- `apps/public-web/ui/HomePageContent.tsx`
- `apps/public-web/ui/PublicNavigationBridge.tsx`
- `apps/public-web/ui/PublicNavigationLayout.tsx`
- `apps/public-web/ui/homeFeedRequests.ts`
- `apps/public-web/ui/useHomeFirstPaint.ts`
- `config/next-bundle-budgets.json`
- `docs/runbooks/public-navigation-stability.md`
- `docs/specs/public-client-navigation.md`
- `src/app/shell/PublicPageShell.tsx`
- `src/modules/home/ui/HomeHero.tsx`
- `src/modules/home/ui/HomeLatestArticles.tsx`
- `src/shared/ui/RouteTransition.stories.tsx`
- `src/shared/ui/RouteTransition.tsx`
- `src/shared/ui/settleContent.ts`
- `tests/next-express-api.test.ts`
- `tests/next-home-hydration-browser.test.mjs`
- `tests/next-page-transitions-browser.test.mjs`
- `tests/next-public-first-paint-loaders.test.ts`

Documentation impact: README, navigation spec and this runbook were updated
with the loading, motion, failure and cancellation contracts. The architecture
contract was reviewed and stays accurate. The preceding six-line Unreleased
changelog edit is preserved. The additional entry below is prepared for the
coordinator; it has not been inserted into the overlapping shared document:

> Главная страница больше не ждёт медленные ленты дольше общего бюджета
> первого показа: готовые данные сохраняются, недостающие дозагружаются с
> мягким появлением. Просроченные и покинутые запросы отменяются, включая
> чтение ответа; код дозагрузки исключён из стартового пакета.

The latest integration preflight fetched
`origin/main = a25fb04889f426112bd52896059653771bd5dc15`, equal to task HEAD.
It blocks the 30 uncommitted task paths and `CHANGELOG.md` overlaps with
`/home/debian/.codex-worktrees/unified-table-card-tiles-20261013` and
`/srv/projects/tasks/hearthpulse-data-visualizations-20261013`.
No sibling files were modified or copied. Documentation reconciliation and a
clean committed branch are still required before this is integration-ready.
The coordinator must include the then-current `origin/main`, preserve earlier
tasks, rerun validation and integration preflight, and confirm the previous
release's Production SHA before any next release. This task has no new commit
or deployed Production SHA to report.

A next measured target is article cover delivery: the observed production
upload was 153830 bytes at 1176×597 for a roughly 407×211 displayed image.
That image pipeline has not been changed by this task.

The mandatory public continuation update uses the current `v1.0.106` and
explicitly says it awaits integration and is not in production:
<https://t.me/changelogarena/545>. It was sent through the existing local
helper and server environment; no token or environment copy was exposed.

## Combined release v1.0.107

The five-task integration preserves the home first-paint reduction: its measured
initial JavaScript is 166,206 gzip bytes and CSS is 33,151 bytes, within the
existing home ceilings. Shared navigation and the new chart/table/preview UI
add 203–973 bytes over the earlier JavaScript ceilings on FAQ/privacy, meta,
cards and Arena tiers. Those selected ceilings rise by 1–2 KiB; other routes
keep their limits. Removing duplicate analytics CSS imports saves 1,081 bytes
on archetypes. Its remaining measured CSS is 66,794 bytes, with a reviewed
66 KiB ceiling; the tier/legendary CSS ceiling becomes 50 KiB for the shared
preview styles (measured 51,089 bytes). These are release measurements, not
field performance results.

The account composition reserves one small viewport height across lazy
loading; the slow-chunk regression test covers 390 and 1440 px. Storybook
recovery assertions await both independent feeds. Hover stories verify a
hidden tooltip at widths up to 700 px, where touch navigation is retained.

Browser QA checks the compact FAQ hero independently from section banners.
After asserting translation-save feedback, it dismisses the mobile toast before
clicking the next table action so the notification cannot intercept that click.

Meta-chart QA checks that the responsive SVG fits its viewport. Native table
scroll checks use `TableSurface`’s inner scroll region. Class-distribution
interactions target SVG buttons and assert the resulting deck filter and scroll
position rather than the retired HTML bar controls.

SVG interaction checks wait until the observed plot width matches its SVG
viewBox. They center the measured SVG target and verify its hit point before
clicking; Chromium’s automatic SVG scrolling can otherwise place it under the
fixed mobile header.

## Desktop lightbox close (2026-10-23)

Closing a lightbox flickered on desktop. With a classic scrollbar,
`overflow: hidden` removed its 15px gutter, so the page reflowed wider under
every dialog and jumped back on the frame it closed; the desktop search header
(sticky from 1024px) also scrolled away with the fixed body and popped back
in. The lock now keeps `scrollbar-gutter: stable` on the root while locked when
the page had a classic scrollbar, and the desktop header sticks at
`--page-scroll-lock-offset`, which holds it in place wherever it sits on the
page (a translation is exact only for a header at the very top). The hand-made
hero media lightbox also fades out before it unmounts (`useOverlayFade`): it
unmounts on its own opacity `transitionend`, not on a timer, since a busy
runner starts the transition frames late.
`tests/lightbox-close-stability-browser.test.mjs` samples every frame of a
close at 1440px with real scrollbars and at 412px, and fails on the old lock.
