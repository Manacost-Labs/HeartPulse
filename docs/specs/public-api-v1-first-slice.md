# Public API v1: first production slice

## Objective

Establish the secure, documented foundation for the unified Manacost data API:

- a stable `/api/v1` namespace;
- a protected catalog manifest;
- a public OpenAPI contract;
- administrator-managed, scoped and revocable API keys;
- public developer documentation linked from the site footer.

This slice does not expose raw databases and does not yet promise every card,
deck or metagame record. Those resources will be added incrementally behind the
same authentication and versioning contract.

## Technical context

- React 19 and TypeScript 5.8 frontend
- Express 4.21 modular routers
- Node SQLite persistence
- Existing cookie session, administrator authorization and CSRF boundary
- Existing parchment and burgundy visual system

## HTTP contract

### Public documentation

`GET /api/v1/openapi.json`

- requires no credential;
- returns the committed OpenAPI 3.1 contract;
- may be cached for five minutes;
- contains no environment-specific secrets.

### Catalog manifest

`GET /api/v1/catalog/manifest`

- requires `X-API-Key`;
- requires the `catalog.read` scope;
- returns API version, schema version, generation time and the currently
  available resource descriptors;
- sends `ETag` and a short private cache policy only after successful
  authentication, so a shared cache cannot bypass credential checks.

### Administrator key management

- `GET /api/admin/api-keys` lists non-secret metadata.
- `POST /api/admin/api-keys` accepts a name and scopes and returns the raw key
  once.
- `DELETE /api/admin/api-keys/:id` revokes a key idempotently.

Every endpoint requires an authenticated full administrator. Cookie-backed
mutations also require the existing `X-CSRF-Request: 1` boundary.

## Data contract

Key metadata contains:

- `id`;
- `name`;
- `prefix`;
- `scopes`;
- `createdAt`;
- `createdBy`;
- `lastUsedAt`;
- `revokedAt`;
- `status`.

It never contains `keyHash` or the raw key. The create response includes an
additional `apiKey` field exactly once.

Errors use:

```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "API key is missing or invalid"
  }
}
```

Error codes are stable, machine-readable values. Messages are safe for display
but clients must branch on `code`, not message text.

## Threat model

<!-- markdownlint-disable MD013 -->

| Boundary | Abuse case | Control |
| --- | --- | --- |
| Admin browser to key API | Non-admin creates or revokes keys | Existing admin session authorization |
| Cookie mutation | Cross-site request creates a key | Existing origin and CSRF-header policy |
| Key creation | Weak, duplicate or leaked key | 256-bit random secret, unique prefix, one-time response |
| Database disclosure | Attacker recovers usable credentials | Only SHA-256 digest and prefix are stored |
| Public API request | Unknown, revoked or under-scoped key reads data | Constant-time verification and explicit scope check |
| Logs and analytics | Credential appears in telemetry | Never log request key or return it after creation |
| High request volume | One key exhausts service capacity | Stable key identity enables per-key limits in the next slice |

<!-- markdownlint-enable MD013 -->

## Developer documentation

Canonical page: `/developers/api/`.

It includes:

- current API status and version;
- authentication example;
- first endpoint and response example;
- error model;
- one-time key handling guidance;
- link to the OpenAPI JSON;
- roadmap labels that clearly distinguish available and planned resources.

The footer link is a normal crawlable anchor. The page uses the existing route
shell, responsive layout and keyboard-visible focus treatment.

## Admin experience

The admin navigation gets a dedicated `API` section. The section supports:

- loading and empty states;
- key name input and the fixed initial `catalog.read` scope;
- one-time secret presentation with copy action and an explicit close action;
- masked key list with status and last-used time;
- revoke confirmation and success/error feedback.

The raw key exists only in component memory and is discarded when the one-time
panel closes or the administrator leaves the section.

## Verification

- Contract tests begin red for key creation, storage, validation, scope checks,
  revocation and response redaction.
- Route tests cover 401, 403, validation failures, one-time secret response and
  no-store headers.
- UI tests cover footer routing and admin empty, success, error and revoke
  states.
- Storybook covers the independently authored key-management states.
- Type checking, architecture lint, React checks, Semgrep, Gitleaks, dependency
  audit, production build and focused regression suites pass.
- Real-browser review covers desktop and mobile developer docs, admin key
  creation, keyboard focus, console, network and accessibility.
- Production smoke checks validate the docs page, OpenAPI response, protected
  manifest rejection without a key and successful health response.

## Rollback

The SQLite table is additive and can remain unused after an application
rollback. The router, documentation page and footer link can be reverted
independently. Revoked or created key records contain no recoverable raw secret.
