# Performance of measured slow public pages

## Implemented changes

- Archetypes: bounded catalog refresh, anonymous summaries before account
  verification, two public format entries for 30 seconds per mounted page,
  independent protected core/history/analysis reads and local block retries.
  Optional analysis code loads separately; its own recovery boundary leaves
  builds visible if that code fails to load. The catalog budgets tighten by
  5 KiB JavaScript and 4 KiB CSS. Two near-limit routes, legendaries and the
  Standard deck builder, gain 1 KiB JavaScript each for roughly 0.1 KiB of
  shared async-loader growth and release-ID variation. The aggregate ceilings
  therefore fall by 3 KiB JavaScript and 4 KiB CSS; other limits stay fixed.
  See [archetype runbook](constructed-archetypes-performance.md).
- Public card identity: the first-paint API reads the validated format catalog
  without the separate enriched detail read. Anonymous lists also skip the
  statistics fetch and history recording; entitled requests preserve them.
  Legacy HTML still uses enrichment.
- Battleground library: known identities survive bounded background refresh;
  missing/archive identities still need authoritative confirmation. See
  [library contract](../specs/battleground-library.md).
- Card/article banner: preload the AVIF chosen by the existing CSS image-set.
  Phones no longer compete with a high-priority parchment preload. Older image
  formats retain the CSS fallback; no image quality change is required.
  Archetypes keep the parchment hint on phones too: the format switch, whose
  background uses it, is the measured mobile LCP element.
- Card detail: the late source warning follows the hero. Production observation
  confirmed that inserting it above the hero moved that section by 61.5 px
  (CLS 0.15684); image dimensions were not the cause of this particular shift.
- Connect: reserve one viewport in both client-only loading and loaded states,
  so the footer does not appear and then jump away when the form arrives.
  The code and identity remain excluded from shared HTML.

## Original error evidence and limits

The 19 October 2026 audit observed 71 transient 5xx responses: 46 detail 503,
24 detail 502 and one catalog 500. Retrying all affected URLs later returned
200. Their relationship to archetype loading is not established.

The bounded 08:39–09:39 UTC service journal contains Battleground library
catalog deadline failures and four Next public-catalog deadline errors. These
support removing blocking refresh and unnecessary enrichment; they do not
prove the cause of every edge 502. No production cache was cleared, service
restarted, or infrastructure changed for the investigation.

A cold process or an unavailable authoritative source can still return 503.
There is no permanent disk snapshot or new background schedule. New code must
not turn uncertainty about a missing card into a cached 404.

## Candidate verification

Use `npm run build:server`, `npm run build:next`, the cache and HTTP contract
suites, and the existing Next browser tests for archetypes, cards and connect.
`tests/next-archetype-details-browser.test.mjs` holds optional responses ten
seconds and tests block retry and logout. The catalog browser test covers
subscriber SSR reuse, format return, local search and recovery while auth is
held. Card/connect browser tests check the measured geometry regressions.
Perform desktop and phone runtime review with the isolated Chrome DevTools MCP.

The 19 October candidate passed 160 unit files, 60 contract files, 20 production
smoke files and all 55 registered browser files, the server/Next/Storybook builds,
type checks and the architecture and privacy gates. The browser suite uses
Google Chrome 150, matching CI and the original audit. The isolated browser
review covered both viewports, delayed optional blocks, local retry, logout,
access revocation and late responses.

In the controlled local mobile profile, three successful samples per variant
gave card-catalog LCP medians of 4.301 and 3.983 seconds after thumbnail priority
adjustment. Connect CLS fell from 0.191 to 0; EDR_453 CLS fell from 0.157 to
0.054. The archetype-catalog LCP remained about 4.23 seconds. These HTTP/1
loopback results do not establish production timings or meet the LCP target.
One earlier catalog sample failed with HTTP 500 and remains in the evidence;
it is excluded from successful timing medians.

Run React Doctor against the pre-task base after new modules are tracked.
The final scan has no errors and five warnings: four complexity warnings and
one async effect-state warning. Request cancellation, resource keys and the
revocation/late-response browser cases verify the latter; no rule is disabled.
Public format snapshots use immutable state rather than render-time ref writes.
The full browser observatory injects the catalog failure on an uncached format
switch; a valid SSR summary intentionally performs no initial browser read.

The existing immutable-release deployer provides rollback to the previous
healthy release if either API or Next readiness fails. No database migration,
Nginx contract change or production data replacement is required. After a
successful switch, watch for new errors and latency regressions before the
full crawl; use the rollback procedure in `DEPLOYMENT.md` if critical flows
or access checks regress.

## Production acceptance after authorized integration

1. Record the integrated commit and deployed Production SHA. Verify one guest
   and one owner-authorized subscriber session, including account switch and
   logout, without reading another person's stored session.
2. Repeat five timing samples for initial/catalog/detail/back/format scenarios.
   Record HTML, summary, first build and optional blocks separately; localhost
   fixture timings are not real-user load times.
3. Repeat the original controlled mobile Lighthouse profile for card catalog,
   articles, archetypes, connect and EDR_453. Target LCP at most 2.5 seconds and
   CLS at most 0.1; use raw traces to explain any regression.
4. Run the original full URL inventory at the bounded audit request rate and
   separately retry all 71 original errors. Confirm zero unexpected 5xx before
   calling the production plan accepted. If fast 502 remain, correlate exact
   request times with the serving edge's upstream error log.

Do not run the full HTTP crawl concurrently with Lighthouse. The
production checks require a deployed candidate; tests against the existing
release do not measure the new code.
