# Cover administrator access

`https://cover.hs-manacost.ru` is available only to an active HearthPulse user
whose current role is `admin` and who is not blocked. It does not receive the
HearthPulse session cookie or a browser-readable bearer token.

## Browser contract

1. An anonymous Cover request is redirected to
   `https://hearthpulse.net/api/auth/cover/start`.
2. An unauthenticated HearthPulse visitor is sent to the existing login panel;
   after a successful password/code or Telegram login it resumes only the
   fixed `/api/auth/cover/start` path.
3. The start endpoint rejects non-administrators. For an administrator it
   creates a signed, two-minute hand-off ticket for the fixed Cover callback
   URL. Its SHA-256 digest is atomically recorded in HearthPulse SQLite at
   redemption, making the ticket single-use across process restarts and workers.
4. The Cover Nginx callback proxy is the only caller that can redeem that
   ticket. It returns a host-only, `Secure`, `HttpOnly`, `SameSite=Lax`
   `cover_admin_session` cookie and redirects to `/` without exposing the
   ticket in a referrer.

## Authorization contract

Every protected Cover request uses Nginx `auth_request` to call
`GET /api/auth/cover/authorize` over loopback. HearthPulse verifies the signed
Cover cookie, resolves the user from its authoritative store, and checks the
current administrator and block state. Removing the role or blocking the user
therefore denies the next Cover request; it does not wait for the eight-hour
Cover-cookie expiry.

The callback and authorization endpoints require the deployment-only
`X-Cover-Sso-Key` header. They return no profile, role, email, session token,
or diagnostic secret.
