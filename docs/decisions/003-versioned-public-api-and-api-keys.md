# ADR 003: Versioned public API and administrator-issued API keys

- Status: Accepted
- Date: 2026-07-29
- Owners: HS-Arena maintainers

## Context

Manacost needs one supported integration surface for a Hearthstone companion
application. Existing browser routes are optimized for the website and combine
several internal datasets. They are not a stable contract for third-party
clients, and exposing the underlying databases would bypass authorization,
validation, caching and future migrations.

The first release needs a stable namespace, machine-readable documentation and
revocable credentials before card, deck and metagame datasets are added.
Future user authorization must also be able to use the standard
`Authorization` header without conflicting with application credentials.

## Decision

- Public integration routes live under `/api/v1`.
- The OpenAPI contract is public at `/api/v1/openapi.json`.
- Application credentials use the `X-API-Key` header. A later user OAuth flow
  may use `Authorization: Bearer` independently.
- Keys are created, listed and revoked only through the existing authenticated
  administrator boundary.
- A raw key is returned exactly once. The database stores only its prefix and a
  SHA-256 digest of a cryptographically random 256-bit secret.
- Every key has an explicit allowlisted scope. The first scope is
  `catalog.read`.
- Public API failures use one structured error envelope and never expose
  internal errors or credential material.
- The first protected resource is a catalog manifest. Further card, media, deck
  and metagame resources extend the same namespace additively.

## Alternatives considered

### Expose the existing databases

Rejected. Direct database access couples consumers to storage layout, bypasses
authorization and makes schema changes unsafe.

### Reuse `Authorization: Bearer` for application keys

Rejected. The planned desktop application also needs user authorization and
subscription claims. Separate headers avoid ambiguous credential precedence.

### Store encrypted or plaintext keys for later display

Rejected. Administrators need to copy a key only at creation. One-time display
and one-way storage reduce the impact of a database disclosure.

### Generate documentation from route reflection

Rejected for the first slice. A committed OpenAPI document is the contract and
can be reviewed before implementation. Runtime reflection would make route
behavior the source of truth and require another production dependency.

## Consequences

- Losing a raw key requires rotation; it cannot be recovered.
- API consumers can pin `/api/v1` and the published schema.
- Scope checks remain explicit at route boundaries.
- The initial release is intentionally small, but later datasets do not need a
  second authentication system or URL migration.
- Key use can be audited without logging the key itself.

## Security properties

- Admin session authorization and CSRF checks protect every key mutation.
- Key names and scopes are validated at the HTTP boundary.
- Prefix lookup is followed by constant-time digest comparison.
- Revoked keys fail with the same generic response as unknown keys.
- Responses containing a newly created raw key use `Cache-Control: no-store`.
- API keys are never written to logs, audit details, Notion or client storage.
