# HS-Arena Changelog

## v1.0.0 - 2026-07-05

- Fixed the Battlegrounds strategy canvas layout so the 5x5 board keeps enough vertical space and placed cards no longer collapse into overlapping rows on wide screens.
- Fixed PNG/WebP export in the Battlegrounds strategy builder by loading board card art through same-origin `/api/card-art` URLs and shipping cache-busted legacy builder assets.
- Fixed the production profile route so the Telegram ID-code button and generated code are rendered in the visible Telegram subscription card.
- Moved the Telegram bot ID-code control directly into the profile Telegram subscription card so it is visible without scrolling past the subscription sources.
- Restored Boosty email binding through `@kolodahearthstoneauthbot`: `/email name@example.com` sends a verification code, writes the verified email to the shared KHA/VIP profile store, and syncs the linked site account.
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
