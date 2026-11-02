# Manacost reader v1

## User outcome

A reader starts login on Manacost, authenticates with HearthPulse, and returns
to the original local article with a Manacost-only opaque session. Saved articles
and a profile use the same Manacost visual language, without WordPress accounts.
Cancellation returns safely without creating a session. Save intent may be
replayed idempotently after login; comment submission must never be automatic.

## Security acceptance criteria

- Static, confidential clients; separate staging configuration except the
  explicitly enabled exact production-to-test bridge described in the ADR.
  Only exact HTTPS redirect URLs; no wildcard or dynamic registration.
- Code-only flow, mandatory S256 PKCE, state, nonce and browser-bound login
  attempts; one successful exchange only, including concurrent replay.
- Validate issuer, audience, signature, expiry and nonce with an OIDC client
  library. ID tokens cannot authorize Reader API operations.
- Reader cookie: `__Host-manacost_reader`, Secure, HttpOnly, SameSite=Lax,
  Path=/, no Domain. Opaque random identifiers; hashed storage keys; encrypted
  upstream tokens at rest with deployment-managed keys.
- Only the exact staging or production Reader client may explicitly request
  `offline_access` and receive consent for up to 30 days. Its original grant,
  binding and refresh family deadlines never slide; access tokens remain 300
  seconds. New consumer
  cookies have Max-Age 2,592,000; existing/no-refresh sessions remain short.
- Refresh uses a durable one-shot claim and atomic active-session comparison.
  Concurrent reads/writes share rotation; logout must win. Invalid or ambiguous
  token responses end local login with a cleared cookie and family revocation,
  not a retry of a potentially consumed refresh token. Parent access remains
  checked online and refresh tokens never reach JavaScript or profile DTOs.
- CSRF and Origin checks on mutations. Auth/API responses are private no-store
  at every cache layer. Public article HTML remains anonymous/cacheable.
- Authoritative identity epoch and grant status checked online on personal
  operations, token issuance and renewal. Reset/block/global logout invalidate
  old access; refresh reuse revokes the whole grant. No positive cache in v1.
- Local logout removes the local session even during identity-provider outage;
  upstream revocation uses a durable retry queue.
- Private paths fail closed on dependency outage, bounded by a shared five-second
  request budget; public articles keep working. Never log cookies/tokens/codes.
- Article key is `(site_id, wp_post_id)`. WordPress remains article-policy
  authority; bookmarks cannot expose unpublished/VIP metadata on stale access.
  Signed versioned metadata events do not replace live access checks.

## Delivery slices

1. Provider and BFF persistence foundations, protocol/storage adversarial tests.
2. Existing identity/epoch adapter, OIDC interactions, server-side BFF exchange,
   rate limits, private proxy configuration and logout/revocation integration.
3. WordPress UI mount, authoritative article policy, Reader API and saved list.
4. Staging browser tests: guest/login/cancel/logout/expiry/block/reset/outage,
   mobile and desktop, both cache-cold and cache-warm pages; independent review.
5. Exact reviewed release activation with rollback. Comments remain disabled.

## Current implementation status

The first login/profile vertical slice is implemented behind disabled deployment
flags. Existing login returns to browser-bound consent. The BFF uses openid-client
to verify the signed ID token, state and nonce, then introspection/userinfo on every
private profile read. A transactional local session comparison makes logout win
against an in-flight re-login. Validated cancellation returns to the local page.

The remembered-login extension requests `openid profile offline_access` only
for an exact staging or production Reader client. Consent explicitly discloses
the 30-day maximum and early revocation by the original HearthPulse session.
Ineligible offline
requests receive `invalid_scope`, never an implicit grant or consent loop.
Provider endpoint tests cover fixed expiry, later rotation, replay, consumed-token
revocation and expired grants. The coordinated BFF release needs independent
review, a consistent private backup and separate real-account browser acceptance.

The exact canonical parent browser session acts as the security generation: every
grant binds to its session hash and stable user ID. Block/reset/delete/logout are
checked against canonical users and sessions on token issue, userinfo and introspection.
Ordinary parent logout also closes this reader session; other devices are not matched
by email. Independent long-lived reader sessions will need an explicit
security epoch.

UI: `GET /reader-api/v1/me` returns `{user:{displayName},csrfToken,profileUrl}`;
401 means no active session; 503 means unavailable identity. No tokens or user IDs
are exposed in this DTO. `POST /reader-auth/logout` requires Origin and
`X-Reader-CSRF` and returns 204. Public HTML always contains an anonymous shell.

## Consent page and client context (E20 S1)

The OIDC consent page at `GET /identity/interaction/:uid` states that the visitor
signs in **through hearthpulse.net** and **into which site**: heading
"Вход через hearthpulse.net" followed, inside the same heading, by
`в <name> (<host>)` (the parenthesis wraps together with the host), the
HearthPulse mark as inline SVG (the page CSP is `default-src 'none'`, so no
`<img>`, not even `data:`), light and dark colour schemes, no external
resource. The form, CSRF check, `decision` values and every response header
are unchanged.

The destination name comes from code, not from environment: `clientPresentation()`
in `server/modules/browserIdentity/configuration.ts` returns
`Манакост / hs-manacost.ru` for `manacost-reader-production` and
`Манакост — тест / test.hs-manacost.ru` for `manacost-reader-staging` (only for
the exact registered callback). Any other client is shown by its callback host.
`validateIdentityOptions` and the client allowlist are not touched.

`GET /identity/interaction/:uid/client` returns `{"name":"Манакост","host":"hs-manacost.ru"}`
for the live interaction held by the requesting browser. It needs no HearthPulse
session (the login card needs it for guests) and exposes no account data.
It answers `404` with an empty body when the interaction cookie is missing,
belongs to another uid, expired, already decided or consumed, and `405` for any
method other than GET. Headers are the shared private ones (no-store, CSP,
noindex); there is no CORS, and the interaction cookie (`Path=/identity/interaction/<uid>`)
is what scopes the answer to one browser.

### Sign-in card names the site (E20 S2)

A guest sent to `/?login#reader_interaction=<uid>` sees, above the form of the
card "Вход в HearthPulse", the note "Вход через hearthpulse.net для сайта
**`<name>`** (`<host>`)" and the line "Пароль вводится только на hearthpulse.net".
When the name equals the host it is shown once. The note appears in sign-in,
registration, password recovery and the code step, and again after a social
sign-in returns to `/?login`.

Name and host come only from `GET /identity/interaction/<uid>/client`,
requested with `credentials: 'same-origin'` and `cache: 'no-store'` when the
handle in `sessionStorage` (`hp_reader_interaction`, ten minutes) is alive and
nobody is signed in. They are rendered as text and never taken from the URL, so
a forged link with an unknown uid never shows a name. A sign-in without a handle
makes no `/identity/` request and reserves nothing. Reading the handle for the
note (`incomingReaderInteraction`, `pendingReaderInteraction`) does not consume
or extend it; the redirect to `/identity/interaction/<uid>` after sign-in and
the removal of the handle are unchanged.

The place for the note is held from the first frame (E20 S2 follow-up). As soon
as a live handle is known (the fragment of `/?login`, or `sessionStorage`) and
nobody is signed in, the card shows the neutral words "Вход через
hearthpulse.net" and "Пароль вводится только на hearthpulse.net"; the
"для сайта `<name>` (`<host>`)" part is appended to the same line when the
answer arrives. The line keeps the height of a named site (two lines, three on
screens up to 350 px; a longer name is cut to those lines, the full text stays
in the page), so the form below does not move, whether the answer takes a
moment or never comes. A `404`, any other status, a network failure or an
answer of an unexpected shape leaves the neutral words without a name: removing
the note would move the form by the height of the note, and the neutral words
are true for any handle and say nothing a forged link could choose.

An expired or unknown interaction on the consent URL answers `400` with
"Вход истёк. Вернитесь на сайт, с которого начали вход, и начните заново."
