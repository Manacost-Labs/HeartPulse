# 007. Numeric public profile identities

## Status

Accepted.

## Context

People need short profile links such as `/id/1/`. The existing authentication
records use internal string identifiers, while previously shared profile links
contain random `p_…` identifiers. Neither value should become a public ownership
or authorization key.

## Decision

- Add a unique nullable `users.public_numeric_id` column and fill it in one
  idempotent transaction.
- Assign configured owner accounts first during the initial migration, then
  assign the remaining accounts in stable creation order.
- Keep an assigned numeric ID immutable. New accounts receive the next available
  positive ID when persisted.
- Use `/id/:publicNumericId/` as the canonical public route.
- Retain `/profiles/:legacyOpaqueId/` as a read-only compatibility route.
- Resolve both forms through the same public API serializer. The response
  allowlist is limited to public ID, display name, avatar initials, and account
  creation date.
- Keep internal account IDs as foreign keys for future saved decks and every
  authorization decision. Public IDs remain presentation-only identifiers.

## Security consequences

Numeric IDs are enumerable, so the public profile must never expose private
data. Blocked, malformed, and missing records share the same generic response.
No mutation endpoint accepts a public or legacy profile ID as proof of identity.

## Migration and rollback

The migration is additive and preserves old opaque IDs. Rolling back the
frontend or canonical route does not require deleting either column or index.
