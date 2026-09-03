# Production SEO and stability monitor

Owner role: SRE / on-call operator.

The versioned GitHub Actions workflow
`.github/workflows/production-monitor.yml` runs
`scripts/production-monitor.mjs` every five minutes and can also be started
manually. Independent groups run concurrently, each request bounds headers and
body consumption, and a four-minute global deadline leaves one minute for
workflow startup and reporting. It retries each check once. GitHub cron can be
delayed, and a failed workflow is not a paging channel by itself. Do not
consider `STAB-405` complete until an operator alert channel is connected and a
failure-to-recovery drill has succeeded.

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

## What it protects

The monitor checks production liveness, readiness, required dataset freshness,
critical public HTML routes, `robots.txt`, the exact sitemap index, static and
all entity sitemap contracts (Standard, Wild-only, Battlegrounds minions,
spells and heroes), deterministic first/middle/last SSR samples for every
entity type, canonical redirects, JSON-LD identity, public-payload privacy, and
a real noindex `404` for an unknown card. The successful report exposes bounded
per-segment URL counts and sitemap sources so a collapsed catalog or LKG
fallback is diagnosable without logging response bodies.

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
