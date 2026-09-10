# Manacost reader identity

Status: staging production-identity bridge exists; remembered-login extension
requires its own reviewed release and acceptance evidence.

## First vertical slice

Reader grants currently depend on the exact existing HearthPulse browser session
as an immutable security generation. Canonical reset/block/logout invalidate that
session. This avoids adding a parallel account lifecycle before it is tested.
The original five-minute slice is extended only for `manacost-reader-staging`
with explicit `offline_access` consent. That grant, canonical binding and refresh
family last at most 30 days; access tokens remain 300 seconds. Other clients keep
their seven-day grant policy and cannot obtain runtime offline consent.

Rotation retains the initial refresh token's `iiat` deadline and an expired Grant
blocks issuance before rotation. The binding is never renewed. This remains
dependent on the exact canonical session: parent expiry/logout/reset/block ends
Reader login earlier. Global HearthPulse browser-auth policy is unchanged.

The BFF uses an encrypted server-side refresh credential, durable one-shot claim
and atomic update restricted to the same active session/claim. Local logout wins
over pending renewal. Ambiguous renewal ends login instead of replaying a token;
the durable revocation endpoint accepts consumed refresh tokens without a type
hint and revokes their whole grant family. Only an opaque 30-day HttpOnly cookie
reaches the browser. Existing short sessions require one fresh login.

## Decision

WordPress continues to publish articles. HearthPulse remains the sole reader
identity authority. A same-origin Manacost BFF owns independent reader sessions;
it never creates WordPress users or shares cookies across registrable domains.
Use maintained OIDC implementations, authorization code with mandatory S256
PKCE, exact redirect allowlists and server-side token exchange. Keep the existing
device authorization module and browser login unchanged.

The module mounts only with an explicit deployment flag. Dedicated additive
provider tables use the canonical SQLite connection; canonical users/sessions
are read-only to this module. Keys are injected, never generated on restart.

The remembered-login release adds no provider schema or canonical-session
migration. Activate the provider before its Reader consumer. Preserve current
authentication data and previous release binaries on rollback: restoring an old
session database can revive revoked access. A previous consumer can continue
using short sessions; remembered sessions may require re-login after rollback.

The user selected real HearthPulse accounts for the test cabinet. One default-off
exception is permitted: production issuer `https://hearthpulse.net/identity`,
client `manacost-reader-staging`, callback
`https://test.hs-manacost.ru/reader-auth/callback`. Both sides require explicit
flags. Other mixed deployments remain rejected. Switch the BFF to fresh keys
and a fresh database; preserve old isolated subjects/sessions/queues separately.

## Boundaries and alternatives

- No headless WordPress migration is necessary for this feature.
- Do not use WP cookies, email matching or device flow for browser SSO.
- Do not implement custom authorization-code or JWT validation protocols.
- The BFF hides tokens from JavaScript, but same-origin compromised WordPress
  JavaScript can still act as the reader. It is not an XSS security boundary.
- Existing comments remain disabled. New comments require a later moderation
  and article-access-policy implementation; no automatic historical import.

## Release gates

Follow the acceptance criteria in `../specs/manacost-reader-v1.md`. Auth state
changes are security-critical and require independent review. Synthetic tests
do not prove production account acceptance; record that separately from the
completed isolated staging browser flow and from future saved articles.

## Sources

- [oidc-provider](https://github.com/panva/node-oidc-provider)
- [OAuth security best current practice](https://www.rfc-editor.org/rfc/rfc9700.html)
