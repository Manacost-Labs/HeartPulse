# Production browser observer

Owner role: SRE / on-call operator.

The observer complements the lightweight production monitor. The monitor
checks release, health, HTTP and sitemap contracts; this observer opens the
site in a real Chromium browser and proves that users can see meaningful
content.

## Commands

Run the public profile:

```bash
npm run observe:production
```

Run against a controlled origin:

```bash
PRODUCTION_BASE_URL=http://127.0.0.1:4173 \
npm run observe:production
```

Run the authenticated profile with the dedicated synthetic account's session
cookie value supplied through a secret environment variable:

```bash
PRODUCTION_OBSERVER_PROFILE=authenticated \
PRODUCTION_OBSERVER_AUTH_COOKIE='<secret-session-value>' \
npm run observe:production
```

Do not place the cookie in shell history, issue comments, workflow inputs or
repository files. Configure it as the GitHub Actions secret
`PRODUCTION_OBSERVER_AUTH_COOKIE`. The account needs the normal Arena and
Battlegrounds subscriber entitlements, must not be an administrator, and must
contain no real personal data.

The scheduled workflow runs the public profile every 15 minutes. The
authenticated profile is available through `workflow_dispatch`; it fails
closed when the secret is missing, expired or rejected.

## What it checks

The HTTP layer opens every path in `config/public-seo-pages.json`, bounds the
response size, requires an HTML document and rejects error pages or off-origin
redirects.

The browser layer checks stable semantic selectors from
`config/production-observer.json`. The public profile covers the home page,
articles, the constructed-card library, login controls and protected-page
paywalls. The authenticated profile verifies `/api/auth/me` and then requires
non-empty Arena classes, Arena tier-list cards, legendary groups,
Battlegrounds heroes, library cards and Battlegrounds tier groups.

The observer is read-only. It does not submit login credentials, request email
codes, register users, refresh subscriptions, edit profiles, vote, or call
administrative mutations.

## Reports

Each run creates a private directory under
`/tmp/hearthpulse-production-observer` unless
`PRODUCTION_OBSERVER_OUTPUT_ROOT` is set. It contains:

- `events.jsonl`: ordered machine-readable lifecycle and check events;
- `summary.json`: final counts and bounded failures;
- `screenshots/<check-id>.png`: public-profile viewport screenshots for failed
  browser checks only.

Authenticated screenshots are intentionally disabled. Reports contain paths,
stable check IDs, durations, HTTP status categories and sanitized messages.
They must not contain query strings, HTML/API bodies, headers, email addresses,
passwords, cookies, tokens, one-time codes, browser storage or subscriber
payloads.

## First response to a failure

1. Open `summary.json` and group failures by `scope`, `code` and `path`.
2. Compare with the lightweight production-monitor run and
   `/api/health/ready`. Determine whether the fault is HTTP, browser runtime,
   authentication, entitlement or data emptiness.
3. Re-run only after recording the first failure. A second green result does
   not erase the original evidence.

Common codes:

| Code | Meaning | Check |
| --- | --- | --- |
| `HTTP_STATUS` | Page returned non-200 | Edge and app logs |
| `NETWORK_ERROR` | Request failed | DNS, TLS, edge and origin |
| `BROWSER_CHECK_FAILED` | Content stayed hidden | Screenshot and runtime |
| `SEMANTIC_COUNT` | Too few records | Dataset and API |
| `API_HTTP_STATUS` | API returned 5xx | Endpoint logs |
| `PAGE_ERROR` | Browser exception | Sentry and release diff |
| `AUTH_SESSION_REJECTED` | Session expired | Rotate synthetic secret |
| `FORBIDDEN_STATE` | Paywall covered data | Auth and entitlement |

## Recovery and resolution

- For a public HTTP or runtime regression, use the immutable release rollback
  runbook and then repeat both production checks.
- For empty or stale data, preserve last-known-good data and follow the dataset
  recovery path. Do not roll back a healthy frontend solely for freshness.
- For an expired synthetic session, create a new session through the normal
  two-step login, replace only the Actions secret, and immediately run the
  authenticated profile. Never weaken production authentication for the
  observer.
- For a false positive, update the semantic contract and its controlled browser
  test in the same change. Do not silently disable the scheduled workflow.

Resolve after the root cause is recorded and two consecutive runs of the
affected profile are green. The closing note must include the check ID, path,
release or dataset version, cause, recovery action and preventive test.
