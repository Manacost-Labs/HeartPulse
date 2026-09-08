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

This slice requests only `openid profile`, not offline access: local sessions last
at most 300 seconds. Refresh, saved articles and publication-policy checks are not
shipped. Comments stay disabled. Isolated staging services and account UI passed
real-browser acceptance. Production issuer activation requires a separate
reviewed release, fresh BFF state/keys and real-account browser verification.

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
