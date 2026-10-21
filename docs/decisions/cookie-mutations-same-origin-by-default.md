# Cookie mutations are same-origin by default

Status: accepted (account sessions security review, 2026-10-21).

## Decision

`server/csrf.ts` refuses every state-changing `/api` request (anything but
`GET`, `HEAD`, `OPTIONS`) that carries the session cookie unless it comes
from this site: `Sec-Fetch-Site` must be `same-origin` when sent, and `Origin`
(or `Referer`) must name `APP_URL` when sent; at least one of them must be
present. This holds for every path. Only cookie-free machine endpoints that
authenticate on their own are exempt (`CROSS_SITE_ENDPOINTS`: the Telegram bot
webhook, one-click newsletter unsubscribe, OAuth token/device-code/revoke,
tracker ingestion, the internal ecosystem hook). The paths in
`PROTECTED_MUTATION_PATHS` additionally need `X-CSRF-Request: 1` (or a bearer
token). A request without the cookie cannot act as the visitor and goes on to
its route's own authentication.

An exemption is granted only to the raw request path spelled exactly like
the endpoint (Express ignores case and one trailing slash): nothing is
decoded or collapsed first, because Express routes on the raw path and keeps
encoded slashes inside a parameter (`/api/account/sessions/..%2F..%2Fv1%2Foauth/revoke`
is a session route, not the OAuth one). The header list is matched on the
normalised path (`normalizedRequestPath`: decoded, lower case, repeated
slashes collapsed, dot segments resolved, no trailing slash); normalisation may
only add a requirement, never remove one. Routes that apply the rule
themselves check it before their rate limit, so refused requests spend none
of it.

## Why

The list of protected paths was matched on the raw path, while Express
matches routes case-insensitively and an `/api` mount swallows repeated
slashes. `POST /api/account/SESSIONS/revoke-others` and
`POST /api//account/sessions/revoke-others` with a foreign `Origin` reached the
handler and ended the visitor's sessions. Normalising spellings is open-ended,
so the same-origin rule no longer depends on the path: a spelling the
normaliser misses can only drop the extra header requirement, never let a
cross-site request through.

## Consequences

- A new cookie-authenticated mutation is protected without being listed.
- A new endpoint that other sites or servers call must be added to
  `CROSS_SITE_ENDPOINTS` and must not authenticate with the session cookie;
  otherwise requests that happen to carry the cookie are refused with 403.
- `tests/csrf.test.ts` and `tests/account-sessions-integration.test.mjs`
  cover the spellings (case, `//`, `/./`, `%2F`, `..%2F`, `%2e%2e%2f`,
  trailing slash), paths that only normalise to an exempt endpoint, and the
  exempt endpoints on their canonical paths.
