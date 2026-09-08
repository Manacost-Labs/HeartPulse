# Manacost reader identity operations

Status: opt-in production-identity bridge candidate. Deployed SHA, flags and
browser acceptance must be checked separately before declaring activation.

## Boundary and configuration

The cabinet stays at `https://test.hs-manacost.ru/account/`; login uses
`https://hearthpulse.net`. Canonical login, WordPress administrator accounts,
mail transport, user records and background jobs remain unchanged.

Composition mounts before body parsers only for `BROWSER_IDENTITY_ENABLED=1`.
Required: `BROWSER_IDENTITY_DEPLOYMENT=production`, `BROWSER_IDENTITY_ISSUER`,
`BROWSER_IDENTITY_ENCRYPTION_KEY` (base64url 32 bytes), `BROWSER_IDENTITY_COOKIE_KEYS`
(JSON array), `BROWSER_IDENTITY_JWKS` (persistent private RSA JWKS with `kid`),
`BROWSER_IDENTITY_CLIENTS` (JSON array of id/secret/redirectUri).
`BROWSER_IDENTITY_TRUST_PROXY=1` requires a restricted, verified proxy chain.
Invalid enabled config fails closed. Never log or commit configuration values.

`BROWSER_IDENTITY_ALLOW_STAGING_CLIENT=1` permits only the production issuer,
client `manacost-reader-staging` and exact callback
`https://test.hs-manacost.ru/reader-auth/callback`. BFF separately requires
`READER_ALLOW_PRODUCTION_IDENTITY_FOR_STAGING=1` and the exact matching tuple.
Both flags default off; no arbitrary test clients or domains are allowed.

## Activation sequence

1. Run `npm run verify:release`, security checks and fresh independent review;
   publish through canonical main CI/deployer with identity disabled.
2. Install reviewed Nginx contracts at origin and both edges. Verify hashes,
   `nginx -t`, N/N-1 compatibility and TLS. A contract transition requires the
   documented one-release acknowledgement; never bypass installed-file checks.
3. Provision fresh root-only provider keys and client secret. Do not copy the
   isolated IdP environment, SMTP sink, keys or databases into production.
   Enable only after the proxy privacy gates below pass.
4. Stop the test BFF. Preserve old config/database/revocation queue. Select a
   fresh private database, encryption/CSRF keys and client secret; atomically
   replace config and restart. Never send the old queue to the new issuer.
5. Verify public start redirects to real HearthPulse; check login, consent,
   cancel, profile, logout, expiry and revocation with a user-approved account.
   No real user's password or email code may be read for acceptance.

The BFF verifies normal HTTPS for `hearthpulse.net`. Its service-private hosts
file may pin a public edge with narrow egress; global host resolution is unchanged.
Provider tables are additive in the canonical database. Existing user/session
tables are read-only to reader identity and keep their current paths and keys.

## Proxy privacy

Explicit `/identity/` routes beat SPA routing at origin and public HTTPS edges.
Disable caches, buffering, query-bearing access/error logs and upstream retries.
Preserve provider CSP and Referrer-Policy: consent GET uses `same-origin` for
native POST Origin, other responses use `no-referrer`. Do not add duplicate
shared policies. The form redirect permits only the exact registered callback.
Login continuation uses a browser-only fragment, never a root-page query value;
the account surface captures the validated handle and immediately removes it.
Edges overwrite client-supplied forwarding headers before the origin real-IP parser.

Edge-to-origin identity TLS verifies SNI `arena.hs-manacost.ru` against the
existing public self-signed trust anchor in
`deploy/nginx/hearthpulse-identity-origin-ca.crt`. No private key is copied.
Origin certificate rotation requires updating and testing this pin first.
Ordinary page proxy behavior is unchanged. Sentinel query values must not appear
in origin or either edge's access/error logs.

### Identity upstream isolation

Both public edges use `hearthpulse_identity_origin` exclusively for `/identity/`.
It has independent peer failure state over the same three loopback tunnels,
no keepalive cache, and an explicit `Connection close`. Do not point identity
back at the legacy `hs_arena_origin` pool: legacy virtual hosts use other SNI
values and disable certificate verification. A cached TCP/TLS connection can
otherwise bypass the new location's certificate verification entirely.

`tests/browser-identity-tls.test.mjs`, run by the canonical integration suite,
primes legacy keepalive connections against a real local TLS origin.
It checks the actual SNI, rejects an untrusted origin, and verifies that the
canonical identity route still succeeds. Test certificates and processes are
ephemeral; no production keys, accounts or interaction values are used.

The shared-pool defect was reproduced independently of the reported intermittent
502. It does not by itself establish the cause of every observed gateway error.
For a release, record status counts and timings for bounded discovery requests
on each edge before and after applying the reviewed configuration. Also follow
a fresh guest login from the test cabinet to the production HearthPulse form.
Do not replay a user's interaction URL or enable query-bearing request logs.
Keep upstream retries disabled: repeating a one-time identity operation is not
a safe availability fix.

For each edge, preserve the exact previous configuration, test the candidate
with `nginx -t`, reload one edge first and check it before updating the other.
Verify installed hashes against the release. Restore the saved configuration
and validate/reload it if the canary regresses; never alter the TLS pin, tunnels,
application sessions or ordinary proxy settings as part of this rollback.

## Cleanup and revocation

The enabled provider starts an unreferenced 60-second cleanup timer and stops
it during process quiesce. A tick deletes at most 500 expired unconsumed model
rows (epoch seconds) and 500 expired bindings (epoch milliseconds), using indexes.
Consumed artifacts and revoked-grant tombstones remain to prevent replay and
late-upsert resurrection. This bounds cleanup work, not total storage; consumed
records accumulate and require a separately reviewed retention design.
Cleanup failures log only a fixed message and retry on the next tick.

Every private operation checks the exact canonical parent session and blocked
status. There is no positive identity cache or offline access; reader sessions
last at most 300 seconds. Saved articles and comments are not this activation;
comments stay disabled.

## Rollback and evidence

Stop the BFF before restoring the old isolated config/state pointer. Disable
production identity or its bridge flag; restore the reviewed application and
matching Nginx contract when necessary. Application rollback alone does not
restore Nginx. Never restore/delete/rewrite canonical users or sessions for this
rollback. Preserve both sets of identity state and keys privately.

The full canonical gate includes synthetic loopback tests, builds and recovery
checks. Also run strict Semgrep, gitleaks and dependency audit. Public-browser
acceptance is separate: an observed redirect is not a completed authenticated
flow, and SMTP submission is not proof of mailbox delivery.
