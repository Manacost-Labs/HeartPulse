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

Rules are chosen on the path as routing may see it
(`normalizedRequestPath`: percent-decoded, lower case, repeated slashes
collapsed, dot segments resolved, no trailing slash).

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
  cover the spellings (case, `//`, `/./`, `%2F`, trailing slash) and the
  exempt endpoints.
