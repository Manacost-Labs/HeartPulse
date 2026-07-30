# ADR 004: Desktop authorization with OAuth device flow

- Status: Accepted
- Date: 2026-07-29
- Owners: HS-Arena maintainers

## Context

Manacost Tracker needs to identify a website user and read that user's current
subscription entitlements. The desktop application is a public client: any
embedded client secret can be extracted, and asking for the website password
inside the application would expand the credential boundary unnecessarily.

The application must work reliably across Windows installations without
requiring a custom URL protocol, a fixed local callback port or an embedded
browser. The website already owns the authenticated browser session and its
subscription record.

## Decision

- Use OAuth 2.0 Device Authorization Grant for the fixed first-party public
  client `manacost-tracker`.
- Keep password entry and approval in the user's system browser at `/connect`.
- Display the client name, current website account and requested scopes before
  approval.
- Issue opaque 15-minute access tokens and rotating 30-day refresh tokens.
- Persist only SHA-256 credential digests; return raw credentials once.
- Revoke the entire token family when a used refresh token is replayed.
- Require explicit `profile.read`, `subscription.read`, `catalog.read` and
  `images.read` scopes.
- Return a dedicated minimal profile and normalized subscription DTO. Raw
  provider payloads and administrative fields are outside the contract.
- Keep administrator-issued `X-API-Key` credentials for server integrations;
  only OAuth bearer tokens represent a user.

## Standards and caveat

The protocol follows RFC 8628, native-application guidance in RFC 8252 and the
OAuth 2.0 Security Best Current Practice in RFC 9700. RFC 8628 notes that the
device grant is not a general replacement for browser-based authorization on
devices with full browsers. It is accepted here because the tracker still
opens the system browser for authentication while avoiding a loopback listener
or custom protocol dependency across supported Windows configurations.

If a signed desktop build later has a reliable claimed HTTPS redirect or
loopback callback, Authorization Code with PKCE should be evaluated as the
preferred successor. The `/api/v1` resource authorization contract does not
depend on that future transport choice.

Primary specifications:

- [RFC 8628: OAuth 2.0 Device Authorization Grant](https://www.rfc-editor.org/rfc/rfc8628);
- [RFC 8252: OAuth 2.0 for Native Apps](https://www.rfc-editor.org/rfc/rfc8252);
- [RFC 9700: OAuth 2.0 Security Best Current Practice](https://www.rfc-editor.org/rfc/rfc9700).

## Threat model

<!-- markdownlint-disable MD013 -->

| Threat | Control | Residual risk |
| --- | --- | --- |
| Password phishing in the tracker | Tracker never collects the password; system browser owns sign-in | A compromised OS can still replace or observe the browser |
| User-code guessing | High-entropy alphabet, ten-minute expiry and rate limits | A user can approve an unexpected request without reading the review screen |
| Login CSRF or approval CSRF | Same-origin browser session, Fetch Metadata, Origin/Referer and CSRF header | Compromised same-origin script remains trusted |
| Token disclosure in storage | OS credential-vault requirement and short access-token lifetime | Malware running as the user can access user-authorized data |
| Database disclosure | SHA-256 digests only; no plaintext device or bearer credentials | Active browser sessions remain a separate security boundary |
| Refresh-token replay | Atomic rotation and family-wide revocation | The legitimate client must sign in again after detected replay |
| Excessive polling | RFC interval enforcement, `slow_down` response and HTTP rate limits | Distributed abuse is handled by the shared edge/rate-limit layer |
| Subscription-provider leakage | Explicit response allowlist omits Boosty/Telegram payloads | Display name and e-mail remain intentionally granted by `profile.read` |

<!-- markdownlint-enable MD013 -->

## Client requirements

- Open `verification_uri_complete` in the system browser.
- Honor `interval`, `authorization_pending`, `slow_down`, `access_denied` and
  `expired_token` responses.
- Store refresh tokens in Windows Credential Manager or an equivalent
  operating-system vault.
- Keep access tokens in memory when practical.
- Never log device codes, access tokens, refresh tokens or profile e-mail.
- Revoke the refresh token during explicit sign-out.

## Consequences

- The website can authorize the tracker without sharing a password.
- Subscription access remains a normalized, revocable server decision.
- Public clients do not need a distributable client secret.
- A desktop compromise cannot be fully mitigated by the API and remains an
  accepted endpoint-security risk.
- Adding third-party clients requires an explicit client registry and review;
  arbitrary dynamic client registration is not enabled.
