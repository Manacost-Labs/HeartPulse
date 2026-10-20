# Session cookies are written at sign-in only

Status: accepted (instant viewer access, 2026-10-20).

## Decision

`/api/auth/me` writes no cookie at all: it only extends the server session
(sliding expiry, as before), and a guest answer names the tag its request
carried instead of clearing it. Sign-in writes both cookies in one response
and sign-out clears both; the browser forgets a stale tag itself when a guest
answer names exactly the tag it still holds. Both cookies live as long as a browser
keeps a cookie (400 days in Chromium); the server's session expiry decides
whether the token still works. `/api/auth/me` reports `sessionExpiresAt`, and
the browser's remembered viewer never outlives it.

## Why

Before, every session check re-issued the session cookie with a fresh
lifetime. A check answered after another tab signed out or signed another
account in put the previous session's cookies back into the browser. With
instant viewer access that answer would also show and remember the previous
account. No response that can arrive late may write session cookies, so
only the sign-in response, which the visitor started, writes them.

## Consequences

- A token in a cookie can outlive its server session; it is then useless and
  `/api/auth/me` answers as a guest.
- Sessions created before this change have no `hp_viewer` tag. They keep
  working but get instant viewer access only after the next sign-in.
- Retired cookie names are expired at sign-in only, no longer on every check.
- See `docs/specs/instant-viewer-access.md` for the browser side.
