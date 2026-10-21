# Account sessions

## Objective

A signed-in visitor sees where the account is signed in and can end any
other session, or all of them at once, from «Вход и привязки» on `/?login`.
An ended session stops working on its very next request.

## Data

The `sessions` table gains three additive columns
(`ensureAccountSessionColumns`, `server/modules/accountSessions`):

- `last_seen_at` (epoch ms): written by a request on the session at most once
  every five minutes (`SESSION_ACTIVITY_INTERVAL_MS`), or sooner when the
  browser summary or region changed, with a targeted `UPDATE`;
- `client`: browser and system only («Chrome · Windows»), derived from the
  `User-Agent`; the full string is not stored;
- `region`: the coarse region the edge forwards in `X-Arena-Client-Region`
  (`russia`, `europe`, …; deploy/nginx/arena-edge-client-region-map.conf),
  or empty. The IP address is not stored in any form.

Rows from before the columns read as never seen, without a device or place.
The whole-store save (`saveAuthStore`) carries the columns through.

## API

All answers are `Cache-Control: no-store` with `Vary: Cookie`; 401 without a
live session, 503 with a generic message when storage fails.

- `GET /api/account/sessions` → `{ sessions: [{ id, current, device, place,
  signedInAt, lastActiveAt }] }`: the viewer's unexpired sessions, this one
  first, then by last activity. `id` is a 22-character one-way digest of the
  stored token hash; neither the token nor its hash leaves the server.
  `place` is a Russian region name or null.
- `POST /api/account/sessions/:id/revoke` → `{ revoked: 1 }`. The id is
  looked up only among the viewer's own sessions: another account's id, an
  expired or malformed one answer 404 and change nothing. The current session
  answers 409: this browser signs out with `POST /api/auth/logout`, which also
  clears its cookies.
- `POST /api/account/sessions/revoke-others` → `{ revoked: n }`: deletes every
  session of the viewer except the current one.

Both revocations follow the site CSRF rule
([ADR 2026-10-21](../decisions/2026-10-21-cookie-mutations-same-origin-by-default.md):
every cookie mutation must be same-origin, these paths also need
`X-CSRF-Request: 1`, whatever the spelling of the path) and a limit of 20
requests per 15 minutes per account.

## Revocation

A revocation deletes the session row. Every session check (`/api/auth/me`),
paywall (`requireEntitlementAccess`) and private route looks the token up in
that table on each request, so the ended session is refused at once; nothing
caches a session. Its `/api/auth/me` guest answer names the `hp_viewer` tag
the request carried, so that browser forgets the tag and the remembered viewer
([instant viewer access](instant-viewer-access.md)); `hp_viewer` never grants
anything on the server.

## Interface

Below the sign-in methods, after a line: «Активные сеансы», one row per
session with a phone or screen icon, the device («Неизвестное устройство»
when the browser did not say) and «place · активен N мин назад» (or «вход
date» before any activity). This browser's row says «Этот браузер» and has
no button; every other row has «Завершить». «Выйти на всех других
устройствах» shows only when other sessions exist and asks for an inline
confirmation first. Results use the page's floating message; after each
revocation the list is read again. A failed list leaves the block out.

## Verification

`tests/account-sessions-routes.test.ts` (summaries, throttle, migration,
ownership, CSRF, 404/409, `no-store`), `tests/account-sessions-integration.test.mjs`
(the real server: session check, paywall and subscription status refuse an
ended session at once; another account is untouched),
`tests/account-dashboard-ui.test.tsx` (rows, labels, confirmation) and
`tests/next-account-sessions-browser.test.mjs` (two browsers: A1 ends A2's
session; A2's next page reaches the guest state with no frame of paid card
statistics and forgets the remembered viewer; «Выйти на всех других
устройствах» after its confirmation).
