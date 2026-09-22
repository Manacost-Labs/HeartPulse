# Telegram identity and account linking

## Purpose

This specification defines Telegram sign-in, account selection and explicit
linking for Arena. It applies after a legacy Login Widget payload or Telegram
OIDC ID token has passed its cryptographic, issuer, audience, expiry, state,
nonce and PKCE checks.

Pure claim parsing and account selection live in `server.telegramAuth`.
Express remains a composition adapter: it verifies providers, supplies the
database, profile snapshots, hashing, randomness, clocks and redirects, then
persists the module result. Cross-domain consumers import only
`server/modules/telegramAuth/public.ts`.

## Trusted identity claims

An account may be selected only by one of these verified immutable keys:

| Provider | Key | Verification boundary |
| --- | --- | --- |
| Login Widget | positive decimal `id` | HMAC and freshness |
| Telegram OIDC | issuer plus `sub` | ID-token and nonce |
| KHA bridge | verified email | profile by Telegram ID |

Telegram documents OIDC `sub` as the unique user identifier. OpenID Connect
defines issuer plus subject as the locally unique stable identifier and forbids
using claims such as `preferred_username`, name or email as unique identifiers:

- <https://core.telegram.org/bots/telegram-login>
- <https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability>

`username`, `preferred_username`, first and last name, and photo URL are display
metadata. They may change only after an account is selected by an immutable
claim. They never participate in account search, candidate selection or a
conflict override.

Verified KHA email is a narrow recovery bridge. Arena accepts it only from a
profile indexed by an already verified decimal Telegram ID and only when
`email_verified_at` exists. An email supplied by a Telegram HTTP payload is
ignored. Arena reads this profile store but never writes it; the KHA bot owns
`/profile`, email challenges and the single authoritative write path.

## Resolution invariants

Resolution fails closed and completes conflict checks before mutation:

1. Reject a claim with neither a positive decimal Telegram ID nor a valid OIDC
   subject. Parsing never strips characters or changes case to manufacture a
   valid key.
2. Find owners by exact provider/key equality. If numeric and OIDC claims exist
   and point to different users, reject the request.
3. Find a verified KHA email by exact normalized email and `boosty-email`
   identity. Reject disagreement with the email owner or immutable Telegram
   owner.
4. For explicit linking, the authenticated target is the only permitted user.
   Reject a missing target or any key already owned by another user.
5. For sign-in, select the consistent immutable owner, then a consistent
   verified-email owner, then the deterministic synthetic email owner retained
   for historical Telegram-only accounts. Create a user only when none exists.
6. After selection, update safe display metadata and a safe verified-email
   upgrade. Preserve a user-chosen display name.
7. Persist user/session changes and every normalized identity in one database
   transaction. Re-read the exact owner after each claim and roll everything
   back on mismatch.
8. Permit at most one numeric Telegram ID and one Telegram OIDC subject per
   user. Changing an immutable key requires an audited administrative repair,
   never an automatic overwrite.

An identity row referencing a missing user is an integrity error. It must not
silently select or create another account. The database index on
`identities(user_id, provider)` supports both the one-key invariant and the
privacy-safe `telegramLinked` lookup.

## Sign-in intents and cookies

Normal Telegram callbacks are sign-in operations; an ambient auth cookie must
never turn them into linking.

- Legacy Login Widget configuration issues a random, short-lived browser nonce,
  stores only its digest in SQLite and sets a host-only one-time cookie.
- Callback and POST completion must present the same nonce and consume its row
  once inside the identity transaction. Replays and expired intents fail.
- OIDC sign-in keeps bounded state, nonce, PKCE verifier, purpose and safe
  return path in an encrypted/signed flow cookie.
- Production cookies are `__Host-manacost_auth_token`,
  `__Host-manacost_tg_oidc` and `__Host-manacost_tg_intent`: Secure, host-only
  and `Path=/`. Local HTTP development retains compatible non-`__Host` names.
- Duplicate or malformed cookie values never crash the server. Session lookup
  handles every candidate deterministically, and malformed values cannot hide
  a valid cookie or bypass the CSRF presence check.

## Explicit account linking

Both supported linking paths start only from an authenticated Arena profile and
use CSRF-protected POST endpoints.

### OIDC

`POST /api/auth/telegram/link-start` creates OIDC state with purpose `link`,
the initiating user ID and the hash of the exact initiating session. The
callback requires the current browser session to match both values. It checks
the session again after the persistence transaction begins and before any stale
auth-store snapshot, identity or session can commit. Logging out or revoking the
session during the provider round trip invalidates the link.

The client accepts only an HTTPS authorization URL on `oauth.telegram.org`.
ID-token validation requires the exact configured audience. A token with more
than one audience must contain `azp`, and every present `azp` must exactly match
the configured Telegram client ID.

### Bot code

`POST /api/auth/telegram/link-code` issues one code for the current user and
session. Its exact format is `TG-` followed by 24 case-sensitive Base64URL
characters (144 random bits). The database stores the code with user, session
hash, expiry and use timestamp. A new code replaces prior active codes for that
user; expiry, replay or session revocation invalidates it.

The webhook accepts the exact code from a private Telegram chat. Code
consumption, active-session checks and identity claims run in one transaction,
so concurrent deliveries have one winner and a conflict cannot burn the token.
The client validates the code, future expiry and bot username returned by the
same response instead of trusting stale configuration.

The general API limiter does not consume webhook quota. Invalid-secret traffic
is limited by client IP before JSON parsing, then the webhook secret is checked,
then verified senders receive a separate bounded limiter. The origin must trust
every active regional proxy address so distinct visitors retain distinct rate
limit keys.

## Public behavior

- `GET /api/auth/telegram/config` returns validated mode, URLs, bot username and
  legacy intent expiry under `private, no-store`.
- `GET /api/auth/telegram/start` and the OIDC callback support sign-in.
- `GET /api/auth/telegram/callback` and `POST /api/auth/telegram` retain legacy
  widget compatibility but require a fresh one-time sign-in intent.
- `POST /api/auth/telegram/link-start` starts explicit OIDC linking.
- `POST /api/auth/telegram/link-code` starts explicit bot linking.
- Authenticated user responses expose only `telegramLinked: boolean`; raw
  Telegram IDs are private server data.
- Link controls are a separate lazy client chunk with idle, loading, success,
  error and already-linked states. Keyboard targets remain at least 44 px.
- KHA subscription snapshots and post-auth subscription refresh still apply to
  the selected user. Boosty email verification stays under `/profile` in the
  KHA bot.

## Compatibility and coordinated release

This is an intentional security cutover:

- old short bot link codes lack a session binding and become invalid;
- the old production `manacost_auth_token` is ignored and cleared, so existing
  users sign in once again; reading it for migration would allow a compromised
  sibling subdomain to inject a valid Domain cookie with a more specific path;
- pending legacy intents and OIDC states expire within their short lifetime and
  can be restarted safely;
- Arena and the KHA bot must be released together because the bot must accept
  the exact strong code before Arena begins issuing it;
- before rollout, audit duplicate/missing Telegram identity ownership and stop
  on conflicts rather than selecting a winner automatically;
- application startup repeats a privacy-safe duplicate/orphan count audit and
  activates a partial unique `(user_id, provider)` index for `telegram` and
  `telegram_oidc`, closing the concurrent second-identity race at the database;
- before rollout through Europe, install the versioned origin real-IP contract
  containing the Limburg IPv4 and IPv6 addresses, validate Nginx and prove that
  two EU clients produce two independent rate-limit keys.

## Acceptance scenarios

- Reusing another account's mutable username with a different immutable key
  never selects that account.
- Changing display metadata for the same ID or subject keeps the same owner.
- Numeric ID, OIDC subject or verified email owned by different users fails
  without mutation.
- A user cannot acquire a second numeric ID or second OIDC subject.
- Explicit linking cannot move an identity, survive logout/revocation or revive
  a stale session snapshot.
- Legacy intents, OIDC states and bot codes reject malformed, expired, replayed
  and concurrent use.
- A malformed or duplicate cookie cannot crash Express or bypass CSRF checks.
- Arena performs no KHA profile writes; failed bot profile persistence leaves a
  retryable verified state and does not silently consume the email code.
- Link UI fits 320, 768 and 1440 px viewports, preserves a visible focus state,
  reports asynchronous status and adds no startup JavaScript.

## Release verification

1. Run focused identity, auth-session, CSRF and repository concurrency tests.
2. Run the KHA bot parser, persistent OTP budget, restart and concurrency tests.
3. Run architecture, module-size, TypeScript, production-build and asset-budget
   gates; verify the account actions remain lazy.
4. Audit production identity rows read-only and resolve any ambiguity through
   an explicit reviewed migration.
5. Validate real-IP behavior at the European proxy and origin before enabling
   the webhook path there.
6. Deploy the compatible KHA bot and Arena release in a coordinated window;
   smoke-test OIDC link, bot link, logout-during-link, one-time re-login,
   `/profile` verification and subscription refresh.
7. Monitor callback/webhook failures, conflict codes, rate-limit cardinality and
   auth-session creation without logging tokens, codes or personal data.

## Browser session cookie compatibility

HTTPS logins issue `__Host-manacost_auth_token` with `Secure`, `HttpOnly`,
`SameSite=Lax`, `Path=/` and no Domain attribute. Login and logout expire the
retired `manacost_auth_token`, including its historical Arena-domain variant.
Existing sessions under the retired name remain valid until their normal
expiry or revocation. Browser identity and normal authentication accept that
name only when the primary cookie is absent; a malformed primary cookie does
not select another legacy identity. CSRF protection covers either name.
