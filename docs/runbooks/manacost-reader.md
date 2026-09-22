# Manacost reader identity operations

Status: foundation only. Do not mount or deploy as an enabled authentication
service. There is no public login/profile/bookmark feature in this slice.

## Verification

```bash
npm ci --ignore-scripts
npm run test:browser-identity
npm run lint
npm run lint:architecture
npm run test:discovery
```

Tests use ephemeral loopback HTTP servers, synthetic RSA keys and in-memory
SQLite databases. They never connect to an identity service or live user data.
The provider defaults to proxy trust disabled. Tests enable proxy interpretation
only for their synthetic loopback transport; production must restrict trusted
proxy access before enabling it.

## Required before activation

- Register exact HTTPS issuer/client/callbacks, with separate staging keys and
  clients. Production issuer is `https://hearthpulse.net/identity`; production
  callbacks are `/reader-auth/callback` on the two Manacost public domains.
- Provision persistent RSA signing keys with `kid`, cookie signing keys and an
  independent 32-byte AES key outside source control. Restrict database and
  backups to the service account; the encrypted payload is bound to model and
  identifier. Key rotation/recovery needs a tested migration before use.
- Implement epoch/grant checks against authoritative user state, existing
  login and consent interactions, rate limits, redacted error handling and
  the Manacost BFF. Do not substitute a cached profile for active identity.
  Introspection is restricted to the token's client and calls the supplied
  account resolver on every check. The resolver still needs the live epoch
  adapter. Revoking either access or refresh tokens invalidates the complete
  consent grant; the next login must request fresh consent.
- Register OIDC middleware before body-parsing middleware. Preserve CSRF
  protections outside protocol endpoints; pin callbacks and remove query/code
  data from logs. Do not expose the library development interaction pages.
- Implement bounded expiry cleanup and a safe retention policy for revoked
  grant tombstones. They deliberately never expire in this foundation to
  prevent late writes from resurrecting a revoked grant.
- Complete the private-cache/proxy, bookmarks/article policy, revocation queue,
  UI, end-to-end staging and independent review gates in the v1 specification.

## Rollback boundary

No current authentication table or route is changed. Removing the unmounted
module has no effect on existing user sessions. After activation, rollback
must disable only reader routes/UI, revoke reader sessions and preserve the
existing HearthPulse login and WordPress administrator authentication.
Never delete identity/user databases to roll back an application release.
