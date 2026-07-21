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

## What it protects

The monitor checks production liveness, readiness, required dataset freshness,
critical public HTML routes, `robots.txt`, the exact sitemap index, static and
Standard-card sitemap contracts, deterministic first/middle/last Standard card
SSR samples, canonical redirects, JSON-LD identity, public-payload privacy, and
a real noindex `404` for an unknown card.

Impact of a failure is high: users or crawlers may receive an unavailable or
stale site, an invalid canonical/indexing response, an incomplete sitemap, or
private fields in a public document. Treat a repeated failure as a P0 until its
scope is known.

## First three actions

1. Open the failed workflow run, record the failed check labels, release
   identifier, and `/api/health/data` result. Do not copy response bodies or
   credentials into the incident.
2. From a second network, request the exact failed endpoint and compare status,
   `X-Sitemap-Source`, ETag, canonical, robots metadata, and current release
   with the report.
3. Stop further crawl expansion. If data is stale or upstream is unavailable,
   retain the last-known-good snapshot. If the failure began with a release,
   use the immutable rollback procedure and then recheck health, sitemap, and a
   sampled card detail.

## Fallback and rollback

- Data incident: keep the verified last-known-good sitemap/catalog, investigate
  the upstream candidate, and never delete or replace the sitemap with an empty
  response.
- Release regression: roll back to the compatible immutable N-1 release,
  verify `/api/health/ready`, `/api/health/data`, `/sitemap.xml`,
  `/sitemaps/standard-cards.xml`, and one sampled card detail before resolving.
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
