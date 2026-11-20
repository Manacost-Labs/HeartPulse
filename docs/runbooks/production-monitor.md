# Production SEO and stability monitor

Owner role: SRE / on-call operator.

The versioned GitHub Actions workflow
`.github/workflows/production-monitor.yml` runs
`scripts/production-monitor.mjs` every five minutes and can also be started
manually. Independent groups run concurrently, each request bounds headers and
body consumption, and a four-minute global deadline leaves one minute for
workflow startup and reporting. It retries each check once. GitHub cron can be
delayed (in practice a run every few hours on a quiet repository), so the
workflow alone does not meet a 15-minute detection target; see
[Alerting](#alerting).

The production deployment workflow uses the same monitor with two explicit
profiles while it still owns the `hs-arena-production` concurrency lock:

- `release` is blocking. It verifies the exact deployed Git SHA, process
  readiness, crawl/SSR contracts, constructed-card envelopes and critical
  HTML routes. A ready application may report `dataStatus=degraded`; freshness
  is deliberately not a release rollback signal.

- `freshness` runs after the release check and is non-blocking for the frontend
  release. It fails unless the required datasets are fresh and non-empty, so
  LKG remains visible as degraded evidence rather than a false green result.
- `full` is the default scheduled profile and combines both sets of checks.

Image delivery probes (`release` and `full`) fetch the pictures of stable
cards through each path pages use: `/api/card-image/CS2_029/full.webp`
(edge-local), the HearthstoneJSON proxy (`hsjson/…/256x/CS2_029.png`) and the
data API proxy with a resize (`db/uploads/art/BG28_300.jpg?width=96`); each must
be `200` with an image type. A card no source has
(`MANACOST_MONITOR_ABSENT_CARD`) must answer `404`: a `5xx` there means every
fallback chain of pictures waits for the source again (#574).

Constructed-card probes accept canonical game IDs and temporary
`blizzard:<dbf>` IDs used by announced cards. The selected list ID must
resolve to a public detail page in the same format.

The browser observatory is release-blocking. `deploy-production` depends on
both release validation and browser QA, and the exact-SHA post-deploy checks
execute in the same job so another production deployment cannot take the lock
between release activation and verification. A newer `main` workflow also
cannot cancel an in-flight production workflow; pull-request validation remains
cancellable when a newer commit supersedes it.

Manual profile examples:

```bash
PRODUCTION_MONITOR_PROFILE=release \
EXPECTED_RELEASE_SHA=<40-character-git-sha> \
PRODUCTION_BASE_URL=https://hearthpulse.net \
node scripts/production-monitor.mjs

PRODUCTION_MONITOR_PROFILE=freshness \
PRODUCTION_BASE_URL=https://hearthpulse.net \
node scripts/production-monitor.mjs
```

## Page templates and sitemaps

`full` and `release` request one URL of every indexable public page template
(`indexPolicy: index` in `src/shared/seo/publicRouteInventory.json`) and the
sitemap index, `static.xml` and each entity sitemap. A page must answer 200
HTML, with no error document and no `noindex` header or meta tag. Requests are
GET only, one at a time with a 150 ms pause
(`MONITOR_REQUEST_PAUSE_MS`), with the `User-Agent`
`hs-arena-external-monitor/<version>`.

The list lives in `scripts/production-monitor-templates.mjs`. Static pages are
taken from the inventory automatically. A dynamic template needs one record in
`SAMPLE_SOURCES`: a fixed `path`, or `segment` (the first URL of an entity
sitemap segment). A template that cannot be sampled goes to
`UNMONITORED_TEMPLATES` with the reason; the unit test fails for an indexable
template that is in neither, and the monitor reports such a template as a
warning. A new sitemap segment is one record in `ENTITY_SITEMAP_SEGMENTS` plus
one in `SAMPLE_SOURCES` for its detail template.

Every entry must carry a `lastmod` (`YYYY-MM-DD`): the index, `static.xml` and
each entity sitemap. The monitor fails on a `<url>` or `<sitemap>` without one
(`<label>: entry N has no lastmod`), on a malformed date, and when an index
date is not the latest date of its sitemap
(`sitemap index lastmod … is not the latest entry lastmod …`). A segment the
server could not build and has no stored copy for is left out of the index
rather than listed undated (the index answers 503 only when nothing at all
can be listed). The monitor sees it as
`sitemap index does not contain the exact public segment set (missing:
<path>; …)`; look at that segment's refresh error in the service log.
The rules of the dates are in `docs/specs/seo-foundation.md`
(«`lastmod` semantics»). The edge caches the index and each segment
separately, so a difference between them right after an update is asked again
with a cache-busting query (`lastmod-recheck`): it is a warning («the edge
caches differ, a fresh pair agrees») when the fresh pair agrees and an error
only when it does not.

Thresholds: a page slower than 1 s or a sitemap slower than 2 s is a warning
(`MONITOR_PAGE_WARN_MS`, `MONITOR_SITEMAP_WARN_MS`); 10 s is a timeout and a
failure. A sitemap served from the last-known-good copy
(`X-Sitemap-Source: last-known-good`) is a warning. Warnings appear in the
report and the run summary and never open an alert.

Not sampled today: `constructed-archetype-detail` (no sitemap segment until
the archetype segment of issue 299 lands), `bg-library-archive-detail` (exists
only for retired cards, no sitemap lists them) and
`bg-library-additional-detail` (no public source of a stable URL).

## Data freshness

`/api/health/data` answers 503 when any dataset, including the optional
`hs-data-api` one, is not fresh, so the status code alone said nothing about
the cause. The monitor now reads the report: a required dataset
(`winrates`, `tierlist`, `legendaries`, `constructed-cards-standard`,
`constructed-cards-wild`) that is missing, empty, or stale fails the check with
its name and age. A required dataset on the last-known-good copy for less than
30 minutes (`MONITOR_LKG_MAX_AGE_MS`) is a warning; the age counts from the last
refresh of that copy, so this is a short-term guard, not a duration of the
whole incident. A stale optional dataset is a warning; a known one carries its
issue in `knownIssues` (`KNOWN_DATASET_ISSUES` in the monitor, currently
`hs-data-api` -> #398, HSGuru Brawl). Remove the entry when the issue closes.

## Alerting

After every scheduled or manual run the workflow calls
`scripts/production-monitor-alert.mjs` with the `GITHUB_TOKEN` (permission
`issues: write`), which keeps one issue per outage:

- red and no open alert: opens an issue labelled
  `type:bug source:qa agent-team` with the failed templates, URLs, statuses and
  times;
- red with a different set of failures: one comment, the issue is not
  duplicated;
- red with the same failures: nothing;
- green with an open alert: a recovery comment and the issue is closed.

The open alert is the open issue with these labels whose body carries the
marker `<!-- production-monitor-alert -->`; do not remove the marker. GitHub
notifies the repository watchers about the issue; there is no Telegram channel
in the workflow because the repository has no bot secrets. For a faster
trigger than GitHub cron, run `node scripts/production-monitor.mjs` from a
server timer and `scripts/production-monitor-alert.mjs` with
`PROBE_OUTCOME`, `MONITOR_REPORT_FILE`, `GH_TOKEN`, `GH_REPO`, `GITHUB_RUN_ID`.
A failure-to-recovery drill (`STAB-405`) on production is still to be done.

## What it protects

The monitor checks production liveness, readiness, required dataset freshness,
critical public HTML routes, `robots.txt`, the exact sitemap index, static and
all entity sitemap contracts (Standard, Wild-only, Battlegrounds minions,
spells and heroes, cosmetics, guides archive and the Standard archetypes),
deterministic first/middle/last SSR samples for every entity type (five spread
samples for archetypes, whose JSON-LD must describe the page's own URL),
canonical redirects, JSON-LD identity, public-payload privacy, and
a real noindex `404` for an unknown card. While the card API reports its
catalog as last-known-good (`X-Data-Cache: LKG`), absence cannot be proven and
the expected answer is the retryable noindex `503` with `Retry-After`; the
report then carries `unknownCard: "unverifiable"` instead of `"absent"`. A
`503` while the card API answers anything else, or any other status, fails the
check and names the observed state. The
successful report exposes bounded per-segment URL counts and sitemap sources so
a collapsed catalog or LKG fallback is diagnosable without logging response
bodies.

Public-payload privacy fails on `QA_PRIVATE`, `statsAccess`,
`subscriptionPayload`, `privateSentinel` and `deckCode`. It covers the entity
sitemap XML, the entity SSR samples above, the unknown-card `404` and those
page-template samples whose path is in `OPEN_DECK_CODE_ROUTES`
(`/standard/fun-decks/`, archetype and card detail). Other page templates are
not checked for markers (card listings carry the guest flag
`statsAccess:false`). Deck codes are open by the owner's decision of
2026-11-18, so `deckCode` is allowed only on archetype detail
(`/standard/archetypes/<format>/<slug>/`), `/standard/fun-decks/` and card
detail (`/standard/cards/<format>/<id>/`): the `OPEN_DECK_CODE_ROUTES` list in
`scripts/production-monitor.mjs` (#580). A new page that opens deck codes is
added to that list together with its owner decision; on the other checked
documents `deckCode` still fails.

Release-profile impact is high: users or crawlers may receive an unavailable
site, the wrong release, an invalid canonical/indexing response, an incomplete
sitemap, or private fields in a public document. Treat a repeated release
failure as a P0 until its scope is known. A freshness-only failure is a data
incident: preserve the verified LKG, keep the status degraded, and escalate by
the affected dataset's SLO instead of rolling back an otherwise healthy
frontend release.

## First three actions

1. Open the failed workflow run, record the failed check labels, release
   identifier, and `/api/health/data` result. Do not copy response bodies or
   credentials into the incident.
2. From a second network, request the exact failed endpoint and compare status,
   `X-Sitemap-Source`, ETag, canonical, robots metadata, and current release
   with the report.
3. Classify the failure before acting. If data is stale or upstream is
   unavailable, retain the last-known-good snapshot and run the freshness
   recovery path. If the blocking `release` profile failed after deployment,
   use the immutable rollback procedure and then recheck release SHA, health,
   sitemap, and a sampled card detail.

## Fallback and rollback

- Data incident: keep the verified last-known-good sitemap/catalog, investigate
  the upstream candidate, and never delete or replace the sitemap with an empty
  response.
- Release regression: roll back to the compatible immutable N-1 release,
  verify the release-profile contract, then inspect `/api/health/data`
  separately before resolving. Do not roll back solely because the freshness
  profile reports stale data.
- Monitor false positive: do not disable the workflow silently. Document the
  exception, owner, reason, and expiry, then add or repair a deterministic
  contract test.

## Resolution criteria

Resolve only after two consecutive green scheduled runs, or after an explicitly
documented stricter product standard is met. The closing note must name the
affected endpoints, root cause, release/data version, fallback or rollback
used, and the preventive test or follow-up owner.

## Privacy

The monitor report contains labels and bounded error summaries only. It must
never log response bodies, query strings, authorization/cookie values, deck
codes, tokens, or subscriber/admin payloads.
