# Account page design

## Objective

The personal account opened with `/?login` answers three questions in this
order: which paid sections are open and why, how to open the rest, and which
ways into the account are linked. Contests and prize contacts follow. Public
profile data stays public-only.

## Layout

- A burgundy header with the avatar, the name as the page's only `h1`, the
  main contact, «Публичный профиль», «Копировать ссылку» and a «⋯» menu
  with «Контакты и рассылка» and «Выйти из аккаунта».
- The access card. With access it names the source (Boosty level and price,
  Patreon tiers or the Telegram VIP channel), the last check and links to the
  open sections; closed sections follow as plain items. Without access it
  offers the Boosty e-mail confirmation, Patreon (when configured) and a
  Boosty subscription link, then lists what a subscription opens.
- «Вход и привязки»: e-mail, Telegram, Boosty and Patreon (when configured),
  each with its state and the action that links it.
- Contest entries, one quiet line while there are none.
- «Контакты для призов и рассылка», folded by default.
- Results of saving, linking and checking float at the bottom of the
  screen. Successes hide after six seconds; errors stay until closed.

## Signed-out view

`/?login` without a session shows one card: a burgundy emblem, the `h1`
«Вход в HearthPulse», «Вход» and «Регистрация» tabs, e-mail and password,
«Получить код», then Telegram and the social providers as labelled buttons,
«Забыли пароль?» and the terms and privacy links. The code step says where
the code went and points to the spam folder. Registration asks for the
newsletter as an optional, unchecked box; `/api/auth/register` records the
choice and no longer rejects a declined newsletter. `LoginCard.tsx` renders
the view, state and requests stay in `LoginPanel.tsx`.

## Acceptance criteria

- A refresh, a retry or a Boosty request keeps the last known access state
  on screen. Only the first check shows the neutral state; a failed first
  check offers «Проверить снова» and the Boosty confirmation instead of a
  subscription offer.
- «Проверить снова» is available with and without access. A Boosty grace
  period or an administrator grant shows the server's note.
- The Telegram row shows only the server-owned username and offers linking
  only through OIDC or the bot code.
- At 320, 390 and 1440 px nothing overflows horizontally, the «⋯» menu stays
  on screen and every control is at least 40 px high; buttons and inputs are
  44 px. Focus is a 3 px burgundy outline (gold in the header); Escape
  closes the menu and returns focus to its button.
- `/?login` has the tab title «Личный кабинет — HearthPulse» and stays
  `noindex` through the public URL policy.
- The page tour targets the header, access card, Telegram row, Boosty form,
  contests, contacts and menu by their `data-tour-id` values.

## Files

`src/modules/identity/ui/LoginPanel.tsx` keeps the account state, requests
and the signed-out login view and passes the signed-in state to
`AccountDashboard.tsx`. The dashboard is split into `AccountAccessCard`,
`AccountLinks`, `AccountContests` and `AccountSettings`, styled only by
`AccountDashboard.css`. `model/accountDashboard.ts` derives the section
tiles, the access source line and the linked accounts. Login has no
passwordless or social-only registration yet; that needs a backend change.

## Verification

`tests/account-dashboard-model.test.ts`,
`tests/account-dashboard-ui.test.tsx` and `tests/login-card-ui.test.tsx`
cover the derived state and the markup of each state;
`tests/auth-credential-routes.test.ts` covers a declined newsletter.
`tests/next-account-surface-browser.test.mjs` and the profile and public
auth blocks of `scripts/e2e-qa.mjs` check both views in a browser at both
widths, including the floating messages, the tour and axe. The Storybook
stories «Profile/Account workspace» use synthetic data with intercepted API
calls.
