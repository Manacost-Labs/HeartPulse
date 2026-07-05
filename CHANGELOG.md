# HS-Arena Changelog

## v1.0.0 - 2026-07-05

- Added a public changelog workflow for `arena.hs-manacost.ru`: every AI agent must post project changes to `@changelogarena`.
- Added a Telegram changelog helper that posts through `@kolodahearthstoneauthbot` using the server env file.
- Improved Telegram login behavior: OAuth opens in a separate tab and the original tab polls the session after confirmation.
- Hardened Telegram OIDC state handling by keeping several recent auth states and clearing only the matched state.
- Checked page integrity and performance for the main public routes.
- Cleared stale swap usage on the server.
