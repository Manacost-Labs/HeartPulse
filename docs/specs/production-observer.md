# Production observer

Status: accepted for implementation (MC-137).

## Problem

The lightweight production monitor proves HTTP, health, sitemap and release
contracts, but it cannot prove that a browser rendered useful page data. A
successful document response can still hide a broken JavaScript chunk, an
empty library, an empty tier list, or an unusable login screen.

## Outcome

One read-only command checks `https://hearthpulse.net` (or an explicit test
origin) in two layers:

1. every route in `config/public-seo-pages.json` returns a usable HTML document;
2. representative browser journeys render their required semantic content.

The observer emits bounded JSON Lines events while it runs and a final JSON
summary suitable for GitHub Actions artifacts and incident triage.

## Profiles

### `public`

Always available. It checks:

- all registered public SEO pages;
- runtime, page and same-origin request failures;
- the login form and its required controls without submitting credentials;
- guest paywalls for protected Arena and Battlegrounds routes;
- visible public content on home, articles, FAQ and the constructed-card
  library.

### `authenticated`

Requires `PRODUCTION_OBSERVER_AUTH_COOKIE` containing only the value of the
dedicated synthetic account's `manacost_auth_token` cookie. The cookie is set
inside an isolated browser context and is never written to output. The profile
first verifies `/api/auth/me`, then checks subscriber-only data surfaces such
as Arena classes, Arena tier lists, legendary groups, Battlegrounds heroes,
library entries and Battlegrounds tier lists.

Missing or rejected authentication is a configuration/authentication failure,
never a skipped check or a green run. The observer does not register users,
request email codes, change profile data, refresh subscriptions, or mutate
application state.

## Configuration contract

`config/production-observer.json` is versioned and contains stable check IDs,
paths, readiness selectors and semantic assertions. An assertion may require:

- a selector to be visible;
- a minimum matching element count;
- the page not to contain a known error/empty-state selector.

Selectors describe product contracts rather than presentation geometry. Check
IDs, not human text, are the stable keys used by alerting.

## Event contract

Every JSONL record has:

- `schemaVersion`, `runId`, `sequence`, `timestamp`;
- `event`: `run_started`, `check_finished`, or `run_finished`;
- `profile`, `checkId`, `scope`, `status`, `durationMs` when applicable;
- `path` without query or fragment;
- a bounded `failure` object with stable `code`, `stage` and sanitized message.

The final summary has aggregate counts and the same bounded failure records.
Output must never contain response bodies, request headers, query strings,
email addresses, passwords, cookies, authorization values, one-time codes,
tokens, subscriber payloads, or browser storage.

## Diagnostics

On a public browser failure the observer may save one bounded viewport
screenshot named from the stable check ID. Authenticated screenshots are off by
default because even a synthetic session can expose account-specific data.
Runtime diagnostics record only sanitized error categories, safe same-origin
paths and HTTP status codes.

## Reliability boundaries

- Each navigation and semantic wait has a timeout.
- The whole run has a deadline.
- Checks run sequentially in one isolated context to reduce production load.
- One retry is allowed for navigation/network failures; semantic emptiness is
  not retried into a false green.
- Browser and filesystem resources close in `finally` paths.
- A report is written even after a failed check or interrupted run.

## Success criteria

- Unit tests prove configuration validation, route coverage, secret redaction,
  deterministic events and failure aggregation.
- A controlled local server proves success and failure behavior in a real
  browser.
- The public profile runs against production without credentials.
- The authenticated profile is documented and fails closed when its secret is
  absent or invalid.
- The scheduled workflow uploads diagnostic artifacts on both success and
  failure.

## Non-goals

- Replacing the existing release, freshness, sitemap or exact-SHA monitor.
- Mutating production data to test administrative workflows.
- Logging page HTML, API bodies or user information.
- Treating a GitHub scheduled workflow as the only paging channel.
