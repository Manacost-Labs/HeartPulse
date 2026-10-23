# Account page design

## Objective

The personal account opened with `/?login` answers, in this order: who is
signed in and what plan they have until when; what the plan includes or how
to get one; the player's own game statistics; which ways into the account
are linked; the newsletter and prize contacts; contests. Only sections
backed by real data are shown: there is no payment history, device list,
theme or saved-deck section because the server has no such data for readers.

## Layout

- One cinematic header plate (`AccountHero`): the tavern art across the whole
  plate inside the wood border, the avatar, the owner name as the page's only
  `h1` (`#account-title`), the main contact, and a translucent plan strip:
  «Подписка активна / Без подписки / Проверяем / Не удалось проверить», the
  plan name and one status line such as «Boosty · до 12 нояб., продлится
  автоматически» or «…, не продлится». Without a subscription the strip links
  to the plan section instead of repeating its state. Actions: «Публичный
  профиль», «Копировать ссылку», «Выйти» (the only sign-out on the page).
- «Подписка» (`#account-access`). With Boosty access the vendored Valyro
  `BillingPlanCard` shows the level, the price per month, «Следующий платёж»,
  «Доступ до» (no renewal) or «Оплачено до» (renewal unknown) with the date,
  and «Управлять на Boosty» beside the date, which opens boosty.to in a new
  tab: the site itself takes no payment actions. Patreon, the Telegram VIP
  channel and an administrator grant show a plain plate without invented
  prices or dates. «Что входит» lists the paid sections as one row of compact
  links; closed sections are dashed and not links. Without access the section
  offers the Boosty e-mail confirmation, Patreon (when configured) and a
  Boosty subscription link, then lists what a subscription opens.
  «Проверить снова» and the last check time sit in the section head.
- «Моя статистика» (`#account-game-stats`): the games the Hearthpulse
  desktop tracker uploaded, in the tabs «Поля сражений», «Стандарт»,
  «Вольный» and «Арена», like HSReplay «My Stats»
  ([player game statistics](player-game-stats.md)). The account owns the
  section head; the body comes through `AccountGameStatsSlot` from the Valyro
  composition `src/features/playerStats` and loads only with the signed-in
  account. Without games it says «Установите Hearthpulse и войдите, чтобы игры
  появились здесь» and links the desktop releases.
- «Данные приложения» (`#account-tracker-data`), only while the desktop
  tracker has stored events: how many and over which dates, «Скачать мои
  данные» (a JSON export) and «Удалить данные» behind an inline
  confirmation, independent of the statistics switch.
- «Вход и привязки»: e-mail, Telegram, Google, Discord and Yandex (each only
  when the server offers it and the account's linked providers are known),
  Boosty and Patreon, each with «Привязан» or the action that links it. Social
  linking uses the providers' own `/api/auth/{provider}/start`, which attaches
  the signed-in account; the return `?login&linked=<provider>` or
  `?login&<provider>=error` becomes one floating message and is removed from
  the address. Below a line, «Активные сеансы» lists the account's signed-in
  browsers ([account sessions](account-sessions.md)): this browser first,
  marked «Этот браузер», each other one with «Завершить», and «Выйти на всех
  других устройствах» behind an inline confirmation.
- «Рассылка и контакты»: the newsletter switch first, then the prize contacts.
  Contact fields do not link Telegram, change the login e-mail or confirm a
  subscription.
- «Мои конкурсы», then one line of help links to specific FAQ answers.
- Every section has the site's three-part head: an eyebrow with an icon, a
  display title and one line of description.
- Results of saving, linking and checking float at the bottom of the
  screen. Successes hide after six seconds; errors stay until closed.

## Data

- `GET /api/subscription/status` (unchanged access contract). Boosty adds the
  display-only `boosty.dates.nextPaymentAt` and, when Boosty reports it,
  `boosty.willRenew` (`server/modules/subscription/boostyRenewal.ts`). Access
  decisions never read `willRenew`.
- `GET /api/account/linked-providers` (`server/modules/accountSignIns`):
  `{ providers: string[] }` with the public names `email`, `telegram`,
  `google`, `discord`, `yandex`, `patreon` of the viewer's own identities. No
  subjects, e-mails or tokens leave the server. 401 without a session;
  `Cache-Control: no-store`, `Vary: Cookie, Authorization`. When the request
  fails the page leaves the social rows out instead of calling them unlinked.
- `GET /api/account/sessions` and its two revocations
  (`server/modules/accountSessions`, [account sessions](account-sessions.md)).
  When the list fails the block is left out.
- Not available and therefore not shown: payment history, server-side theme,
  format or rank defaults, saved decks and favourites.

## Signed-out view

`/?login` without a session shows one card: a burgundy emblem, the `h1`
«Вход в HearthPulse», «Вход» and «Регистрация» tabs, e-mail and password,
«Получить код», then Telegram and the social providers as labelled buttons,
«Забыли пароль?» and the terms and privacy links. The code step says where
the code went and points to the spam folder. Registration asks for the
newsletter as an optional, unchecked box; `/api/auth/register` records the
choice and no longer rejects a declined newsletter. `LoginCard.tsx` renders
the view, state and requests stay in `LoginPanel.tsx`. On `/connect/` the
card title is an `h3` under the page's own `h1`.

`server/mailingContactSync.ts` mirrors the choice into `mailing_contacts`.
An entry that existed before the account (an imported subscriber or a
former member) is linked to it, but its consent changes only for a caller
that knows the account controls the address: the signed-in profile, a
verified e-mail change or the confirmation of a ticked box at the e-mail
code. An unticked box is not a withdrawal: at the code the account takes
over a confirmed, unsuppressed subscription of the address as it is, without
recording a new consent. A password reset keeps the newsletter only if the
list confirms it, so a box ticked by whoever registered someone else's
address does not subscribe the owner. A verified e-mail change and the
Telegram/KHA e-mail paths still apply the account's own flag, which errs on
not sending.

## Acceptance criteria

- A refresh, a retry or a Boosty request keeps the last known plan on screen.
  Only the first check shows the neutral state; a failed first check offers
  «Проверить снова» and the Boosty confirmation instead of a subscription
  offer.
- A past or unparsable `nextPaymentAt` is never shown as the end of access; a
  Boosty grace period names the time access is kept until.
- An administrator grant shows the server's message once.
- Linked providers belong to the account they were fetched for: after a
  sign-out, or a sign-in to another account in the same tab, the social rows
  stay hidden until that account's own answer arrives.
- The Telegram row shows only the server-owned username and offers linking
  only through OIDC or the bot code.
- At 320, 390 and 1440 px nothing overflows horizontally and every control is
  at least 40 px high; buttons and inputs are 44 px. Focus is a 3 px outline.
- `/?login` has the tab title «Личный кабинет — HearthPulse» and stays
  `noindex` through the public URL policy.
- The page tour targets the header, plan strip, Telegram row, Boosty form,
  contests, contacts and header actions by their `data-tour-id` values.

## Files

`src/modules/identity/ui/LoginPanel.tsx` keeps the account state, requests
and the signed-out login view and passes the signed-in state to
`AccountDashboard.tsx`, which composes `AccountHero`, `AccountPlanSection`
(with `AccountAccessOptions`), `AccountLinks`, `AccountSettings` and
`AccountContests`; each section head is `AccountSectionHead`.
`model/accountPlan.ts` derives the plan, its date and renewal line;
`model/accountDashboard.ts` derives the section links, the linked sign-in rows
and the link-return message. The plan card is
`src/vendor/valyro-ui/ai/BillingPlanCard.tsx`, themed by
`src/shared/ui/varyloParchment.css` plus the plan tokens in
`AccountPlanSection.css`.

## Verification

`tests/account-plan-model.test.ts`, `tests/account-dashboard-model.test.ts`,
`tests/account-dashboard-ui.test.tsx` and `tests/login-card-ui.test.tsx`
cover the derived state and the markup of each state;
`tests/account-sign-ins-routes.test.ts` and `tests/boosty-renewal.test.ts`
cover the server additions. `tests/next-account-surface-browser.test.mjs`
signs in with a password and e-mail code against the real backend, checks the
linked providers, starts linking Google, returns with the link message and
signs out; it also checks the layout at 320, 390 and 1440 px. The profile block
of `scripts/e2e-qa.mjs` checks the view with axe and the tour. Storybook:
«Identity/Account Dashboard» (plan states) and «Profile/Account workspace»
(the whole panel with intercepted API calls).

## Loading geometry

The Next.js account composition reserves at least one small viewport height
while its lazy identity view and access state load. The footer stays outside
the initial viewport instead of appearing below a short loader and jumping
when the dashboard arrives. `tests/next-account-surface-browser.test.mjs`
holds the account chunk on mobile and desktop to check this transition.
