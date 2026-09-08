# Manacost reader identity operations

Status: staging login/profile candidate, disabled by default. Not activated on production.

## Isolated staging boot

Use `test.hearthpulse.net` with a fresh database and distinct service UID. Never
copy the production environment or legacy `admin_auth.json`. Explicitly set
`APP_ROOT_DIR`, `SERVER_DATA_DIR`, `ECOSYSTEM_DIR`, `ECOSYSTEM_DB_FILE`,
`KOLODAHS_DB_ROOT`, `KHA_VIP_PROFILES_FILE` and `OLD_GUIDES_DB_FILE` to staging
paths. Disable Redis (`REDIS_ENABLED=0`) and arena refresh
(`ARENA_DRAFT_REFRESH_ENABLED=0`), and leave provider/admin credentials unset.

`BACKGROUND_JOBS_ENABLED=0` disables startup card/cosmetic prewarming, upstream
health polling, subscription refresh, parser recovery, newsletter resumption
and archetype seeding. The default remains enabled for existing deployments.
This flag is not a network or filesystem sandbox: the staging unit must also
deny production data reads and restrict egress. Only canonical login and
identity endpoints are exposed through the staging reverse proxy.

`tests/background-jobs.test.ts` boots the real server in fresh temporary state,
intercepts all fetch calls and verifies both the enabled control and disabled
network-silent startup. Synthetic mail acceptance uses an isolated SMTP sink;
normal mailbox delivery must be checked separately, never inferred from HTTP 200.

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
- Verify deployed reset/block/logout/delete mutations against the implemented
  canonical parent-session binding, not only synthetic fixtures. Introspection
  and userinfo have no positive identity cache. Do not enable offline access:
  the current BFF intentionally creates only five-minute sessions.
- Register OIDC middleware before body-parsing middleware. Preserve CSRF
  protections outside protocol endpoints; pin callbacks and remove query/code
  data from logs. Do not expose the library development interaction pages.
- Implement bounded expiry cleanup and a safe retention policy for revoked
  grant tombstones. They deliberately never expire in this foundation to
  prevent late writes from resurrecting a revoked grant.
- Complete the private-cache/proxy, bookmarks/article policy, revocation queue,
  UI, end-to-end staging and independent review gates in the v1 specification.

## Rollback boundary

With the flag unset, no reader tables/routes are initialized. Disabling the opt-in
module does not modify existing user sessions. After activation, rollback
must disable only reader routes/UI, revoke reader sessions and preserve the
existing HearthPulse login and WordPress administrator authentication.
Never delete identity/user databases to roll back an application release.

## Configuration (names only)

Composition mounts before shared body parsers only for `BROWSER_IDENTITY_ENABLED=1`.
Required: `BROWSER_IDENTITY_DEPLOYMENT` (staging/production), `BROWSER_IDENTITY_ISSUER`,
`BROWSER_IDENTITY_ENCRYPTION_KEY` (base64url 32 bytes), `BROWSER_IDENTITY_COOKIE_KEYS`
(JSON array), `BROWSER_IDENTITY_JWKS` (private RSA JWKS), `BROWSER_IDENTITY_CLIENTS`
(JSON array of id/secret/redirectUri). Never record values in Git, Notion or screenshots.
`BROWSER_IDENTITY_TRUST_PROXY=1` requires a verified restricted reverse proxy and
an origin port inaccessible to arbitrary clients. Invalid enabled config fails closed.

Nginx/CDN must bypass caches and query-bearing access logs on `/identity/*` and
both reader prefixes. No callback analytics. The provider sets no-store, no-referrer,
noindex and a restrictive CSP. The BFF and WordPress setup are in the WordPress
repository `docs/architecture/manacost-reader.md`. Test `.ru` and `.com` separately;
never share reader cookies, client secrets or databases between sites/environments.
