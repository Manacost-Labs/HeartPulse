# Manacost reader v1

## User outcome

A reader starts login on Manacost, authenticates with HearthPulse, and returns
to the original local article with a Manacost-only opaque session. Saved articles
and a profile use the same Manacost visual language, without WordPress accounts.
Cancellation returns safely without creating a session. Save intent may be
replayed idempotently after login; comment submission must never be automatic.

## Security acceptance criteria

- Static, confidential clients; separate staging issuer/client configuration.
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

Slice 1 only. No provider routes are mounted, no live user schema is migrated,
and no keys, WordPress users, redirects or production services are provisioned.
The original architecture is in `../decisions/manacost-reader-identity.md`.
