# HS-Arena Changelog

## v1.0.0 - 2026-07-05

- Added Redis-backed API caches for arena winrates, class matchups, standard matchups, and Battlegrounds proxy responses so tier/content tables survive Node restarts and warm faster.
- Added manual Telegram binding through `@kolodahearthstoneauthbot`: a logged-in user can generate a short ID-code in the profile, send it to the bot, and trigger Telegram subscription verification.
- Hardened identity binding: the same Telegram account or Boosty email can no longer be attached to two different site accounts.
- Improved client-side route switching: route chunks are preloaded on idle and on navigation hover/focus, profile navigation no longer forces a full page reload, and route transitions use a short GPU-friendly enter animation.
- Added a public changelog workflow for `arena.hs-manacost.ru`: every AI agent must post project changes to `@changelogarena`.
- Added a Telegram changelog helper that posts through `@kolodahearthstoneauthbot` using the server env file.
- Improved Telegram login behavior: OAuth opens in a separate tab and the original tab polls the session after confirmation.
- Hardened Telegram OIDC state handling by keeping several recent auth states and clearing only the matched state.
- Checked page integrity and performance for the main public routes.
- Cleared stale swap usage on the server.
