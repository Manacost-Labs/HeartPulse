# Admin CRM

## Objective

Turn the admin **Люди** section (`/admin?section=users`) into a customer
workspace: an operator finds a person, sees why they do or do not have access,
reads their history and leaves context for other administrators without
switching between the Users, Boosty and Telegram sections.

The approved direction is the interactive mock published during the
2026-09-29 admin review. This document covers phase 1. Later phases (overview
alerts and charts, money, growth funnels, navigation regrouping) keep their
own specification updates, because the production browser QA pins the current
dashboard and navigation. The money section is described below.

## Phase 1 scope

1. **Segments.** `GET /api/admin/users` accepts `segment` and `tag` filters.
   `GET /api/admin/crm/segments` returns the count for every segment so the UI
   can render chips without loading the list.
2. **Client card.** `GET /api/admin/crm/people/:userId` returns one person's
   profile, linked accounts, current access, manual grant, access history,
   contest entries, mailing summary, notes, tags and the admin audit trail for
   that user. The UI opens it as a modal side sheet from the user row.
3. **Notes and tags.** Administrators add and delete notes and replace a
   person's tag set. Every change is written to `admin_audit_log`.

Out of scope for phase 1: referral attribution per person (referral clicks are
anonymous and carry no user id), payment history per person (Boosty sales are
aggregated by the external boosty-auth service), bulk actions and saved
segments.

## Segments

All segments are evaluated at request time in SQL. "Now" is the database clock
in UTC.

- `all` (Все): every user.
- `paying` (Платят сейчас): cached provider access,
  `subscriptions.has_access = 1`.
- `manual` (Ручной доступ): an active manual grant, without expiry or
  expiring in the future.
- `expiring` (Истекает ≤ 7 дней): an active manual grant that expires within
  7 days.
- `lapsed` (Потеряли доступ): no provider or manual access now, but a
  `subscription_checks` row with access in the last 30 days.
- `new` (Новые за 7 дней): `users.created_at` within 7 days.
- `blocked` (Заблокированы): `users.blocked_at` is set.
- `admins` (Администраторы): `users.role = 'admin'`.

`tag` filters to users that carry the exact normalised tag. Unknown segment
ids return `400`.

## Client card contract

`GET /api/admin/crm/people/:userId` → `200`:

```ts
{
  person: {
    id, name, email, role, country, createdAt, updatedAt, blockedAt,
    contacts: { telegram, vk, email },
    newsletterOptIn: boolean,
  },
  identities: Array<{ provider, username, createdAt, verifiedAt }>,
  access: {
    hasAccess: boolean,          // provider or manual access now
    source: string,              // cached provider source, see below
    message: string,
    checkedAt: string,
    manual: null | {
      active, grantedBy, grantedAt, expiresAt, revokedBy, revokedAt, note,
    },
  },
  // per-provider flips, newest first, max 50
  accessHistory: Array<{ at, source, hasAccess }>,
  contests: Array<{ contestId, title, status, createdAt }>,
  mailing: null | {
    consentStatus, consentedAt, unsubscribedAt, delivered, failed,
    lastDeliveredAt,
  },
  notes: Array<{ id, body, authorId, authorName, createdAt }>,
  tags: string[],
  // max 50
  audit: Array<{ id, action, actorId, actorName, details, createdAt }>,
}
```

`access.source` is the cached provider source (`boosty`, `telegram`, ...).
An active manual grant appends `manual-access`; when there is no provider
source it is reported as `manual-access` alone.

`accessHistory` is derived from `subscription_checks`, which receives one row
per provider (boosty, telegram, patreon) on every refresh cycle. Changes are
therefore tracked per provider: an entry is emitted when that provider's
`has_access` differs from its previous check, and a provider's first check is
reported only when it grants access, so providers a person never used do not
appear as lost access. The newest 2000 checks are scanned.

Unknown users return `404`. The response never contains password hashes,
session data, OAuth tokens, IP hashes or raw provider payloads.

Mutations (admin only, same-origin CSRF header required):

- `POST /api/admin/crm/people/:userId/notes` `{ body }` → `201 { note }`.
  Body is trimmed, 1–2000 characters.
- `DELETE /api/admin/crm/people/:userId/notes/:noteId` → `200 { ok: true }`.
- `PUT /api/admin/crm/people/:userId/tags` `{ tags: string[] }` → `200 { tags }`.
  Tags are trimmed, lower-cased and deduplicated; empty or longer than 32
  characters are dropped; more than 12 distinct tags return `400`.

Audit actions: `user.note.added`, `user.note.deleted`, `user.tags.updated`
with entity type `user`.

## Data

New tables in the ecosystem SQLite database, created idempotently at start-up:

- `admin_user_notes(id, user_id, author_user_id, body, created_at)`
- `admin_user_tags(user_id, tag, created_by, created_at, PRIMARY KEY(user_id, tag))`

Both cascade on user deletion. New indexes (built once, synchronously, on the
first start after deployment; `subscription_checks` grows by three rows per
user per refresh cycle, so that first start can take noticeably longer than
usual):
`subscription_checks(user_id, checked_at DESC)` for the lapsed segment and the
access history, and `admin_audit_log(entity_type, entity_id, created_at DESC)`
for the per-person audit trail.

## Money section (removed)

The «Деньги» section shipped on 2026-09-29 and was removed on 2026-09-30. On
production the subscription analytics it read reported no new subscriptions
or renewals (the Boosty source does not observe renewals and Tribute had sent
no events since August), so the page showed a misleading total built from a
few paid posts. The revenue card on the overview is removed for the same
reason. `GET /api/admin/boosty/analytics` and its `articles=0` option stay.

## Overview (phase 2)

`/admin?section=dashboard` («Обзор») is the admin landing page. It reads
`GET /api/admin/crm/overview`, which the server caches for 60 seconds
(`?fresh=1`, sent by «Обновить», bypasses the cache). Its cards are «С
доступом сейчас», «Новые пользователи», «Потеряли доступ» and «Истекает за 7
дней»; each opens the matching people segment.

Response:

```ts
{
  generatedAt: string,
  alerts: Array<{
    id, severity: 'critical' | 'warning' | 'info', title, detail,
    action?: { section, segment?, label },
  }>,
  kpis: {
    totalUsers, payingNow, payingProvider, manualAccess, newUsers30d,
    newUsersPrevious30d, lapsed30d, expiringSoon,
  },
  // 30 UTC days, oldest first
  series: { days: string[], newUsers: number[], paying: number[] },
  // newest first, max 15; see server/adminCrmActivity.ts
  activity: Array<registration | admin | contest | mailing>,
}
```

Alerts, ordered by severity:

- `telegram-chat:<chatId>` (critical): in the last two hours at least three
  Telegram checks included that chat and at least half of them failed with a
  chat-level error (chat not found, bot kicked, forbidden, missing rights).
  The detail carries the Telegram error, because members of only that chat
  lose access.
- `telegram-api` (warning): other chat-check failures (timeouts, rate limits,
  network errors) were at least half of all chat checks and at least three.
  They are reported once instead of as a broken chat.
- `boosty-stale` (critical): at least three Boosty checks in the last two
  hours and at least half were stale or had no provider response.
- `expiring-access` (warning): active manual grants expiring within 7 days;
  opens the people list on the `expiring` segment.
- `pending-contest-entries` (warning): contest entries with status `pending`.
- `mailing-failures` (warning): failed deliveries in campaigns created in the
  last 7 days.
- `lapsed-access` (info): the `lapsed` segment is not empty.

The «С доступом сейчас» card shows `payingNow` (provider access or an active
manual grant) with `payingProvider` and `manualAccess`, which match the
`paying` and `manual` segments. The `paying` series counts distinct users
with a successful provider check per UTC day. The scheduled refresh checks
every user every 30 minutes, so this is the daily number of paying
subscribers; it excludes manual grants.

Activity merges registrations, admin audit entries (read-only `*.read` and
`*.observe` entries are skipped), contest entries and mailing campaigns. Admin
entries return the raw action and details; the client labels them with the same
wording as the client card.

The previous dashboard (content counts and nine shortcut buttons) is removed,
and the dashboard no longer loads articles, gallery, referrals, Boosty,
Telegram and mailing data on open.

Production holds about three million `subscription_checks` rows (three per
user every 30 minutes, no pruning), so the overview and the `lapsed` segment
read only indexes: `subscription_checks(source, checked_at)` and two partial
indexes on `has_access = 1`, `(user_id, checked_at)` and
`(checked_at, user_id)`. A query-plan test guards this. Building them adds a
few seconds to the first start after deployment.

## Referral funnel (phase 3)

Clicks on campaign links (`/r/:slug` and `POST /api/referrals/track/:slug`)
also set a first-party cookie `hp_ref=<referralId>.<clickId>.<signature>`
(`Path=/`, `Max-Age` 30 days, `HttpOnly`, `SameSite=Lax`, `Secure` on
https). The signature is an HMAC-SHA256 of `<referralId>.<clickId>` keyed with
the referral IP-hash salt. No personal data is stored in it.

`server/referralAttribution.ts` runs only on `GET /api/auth/me`, the session
check both frontends make on load, so other requests pay nothing. A cookie
with a bad signature is cleared before any session lookup. For a signed-in
visitor the click is looked up in `referral_clicks`; the account is linked in
`user_referrals(user_id, referral_id, click_id, clicked_at, attributed_at)`
only if the link is active and the recorded click happened no later than ten
minutes after the account was created. The click time always comes from the
database, never from the cookie. The cookie is then cleared whether or not an
attribution was made, and a first attribution is never overwritten.
Anonymous visitors keep the cookie until they sign in. Registration code
paths are untouched, so every sign-up method is covered.

`GET /api/admin/referrals` adds `registrations` and `payingNow` (provider
access or an active manual grant) per link, and the referral section shows
clicks → registrations → access with conversion rates. The client card shows
«Пришёл по ссылке» and a timeline entry for the click.

The privacy policy (`src/modules/legalPages/content.json`, section 4)
describes the cookie.

## Navigation (phase 3)

Sections are grouped by job: «Рабочий стол» (Обзор), «Люди и деньги»
(Пользователи, Деньги, Рассылка), «Контент» (Статьи, Галерея, Переводы,
Механики и теги, Фановые колоды), «Рост» (Конкурсы, Реферальная ссылка) and
«Интеграции и система» (Boosty, Telegram, Данные и парсеры, Public API).
Section ids and labels are unchanged. The admin Arena synergy and draft
assistant screens, disconnected since 2026-09-13, are deleted; their server
routes and the pure draft model remain.

## People list (2026-09-30 redesign)

`/admin?section=users` is a table: a search field, segment and tag chips, a
one-line summary and the columns «Человек», «Доступ», «Контакты»,
«Активность» and «Теги» plus the action menu. The person's name opens the
client card. Below 960 px each row becomes a card with labelled fields.

«Доступ» shows one status per person (`personAccess` in
`src/modules/adminCrm/ui/peopleListModel.ts`): blocked (with what unblocking
would restore), manual access with its expiry (a warning within 7 days),
provider access with its source, or none. «Контакты» lists Telegram, VK and a
contact email only when it differs from the account email.

The shared operations header on the mailing, contests, referrals and
translations sections no longer repeats the section title the workspace shell
already shows; it starts with the description, status, actions and metrics.
The Boosty and Telegram sections describe states in plain language instead of
provider terms (`active`, `Grace`, `OIDC ID`, raw member statuses).

## Boosty and Telegram lists (2026-09-30 redesign)

`/admin?section=boosty` and `/admin?section=telegram` use the people-list
layout: one status block, a search field with «Обновить», single-choice filter
chips with counts (`AdminFilterChips`), a one-line summary, a table that turns
into cards below 960 px and pagination of 20 rows. Filtering, the chip counts
and every status label are pure functions in
`src/features/adminIntegrationListModel.ts`; the endpoints and their payloads
are unchanged.

Boosty columns: «Подписчик», «Уровень», «Подписка», «Доступ на сайте» and
«Подписан». Chips: all, opens the site, pays, no paid subscription, inactive;
a second row filters by Boosty level. «Подписка» is one status (inactive,
free, active with or without auto-renewal). «Доступ на сайте» tells apart a
subscriber who opens the site, one who does not, and one who pays for a level
the site does not recognise — the case an administrator has to fix.

Telegram columns: «Человек», «Telegram», «Доступ» and «VIP-группы». Chips:
all, with access, linked without access, not linked, stale check, blocked.
The name opens the client card, because a Telegram account is a site user. A
group the bot cannot read for at least half of the checked accounts is named
in the status block with the action to take; a failed request shows an error
instead of an empty list.

## Content lists (2026-09-30 redesign)

`/admin?section=articles` and `/admin?section=gallery` use the people-list
layout too: a search field with «Обновить» and a primary create button,
filter chips, a one-line summary, a table that turns into cards below 960 px
and pagination of 20 rows. Creating and editing happen in a modal side sheet
(`AdminSheet` from `src/modules/adminCrm`, the same focus, Escape and
scroll-lock contract as the client card), so the list stays in view. Closing a
sheet with unsaved input asks for confirmation. The endpoints and payloads are
unchanged; the pure logic lives in `src/features/adminContentListModel.ts`
and the transport in `src/features/adminContentClient.ts`.

Articles. Columns: «Статья», «Раздел», «Доступ», «Дата», «Оценки» and the row
actions (open, edit, delete). «Статья» shows the cover, the title (it opens
the editor), where the link leads and what the public card is missing: a
description, a link or a cover. Chips filter by mode (only modes in use) and,
while at least one card is incomplete, by what is missing. «Доступ» states
what a reader needs: the Arena or Battlegrounds article subscription, the
«Алмаз» plan for Standard and Wild, or any subscription for a general
article. The summary adds the date of the last publication and the number of
articles dated within the last 30 days. The editor shows the card as a reader
will see it while the draft changes, suggests sections already in use and
refuses an empty title or a link that is neither `http(s)` nor a site path
before anything is sent.

Gallery. Columns: «Арт», «Раздел», «Файл» (dimensions, size, format),
«Добавлен» and the row actions (download the original, delete). The upload
sheet requires a title and an image file.

Moving both sections out of `ContestAdminPanel` made them self-contained,
lazily loaded chunks that fetch their own list when opened.

A filter chip exists only while at least one row matches it. When the
selected chip disappears (its last article was completed or deleted) the
filter falls back to «Все» instead of leaving an empty list. A failed save or
upload is reported inside the sheet, not in the toast, so the message never
covers the sheet's buttons. After a row is deleted, focus moves to the summary
line. A success toast dismisses itself after 6 seconds in every admin section,
because on a phone it lies over the page toolbar; error toasts stay until
closed.

## Permissions

Every endpoint requires the full administrator role (`adminAuth`), matching
the existing Users section. The contest-only moderator never sees the CRM.

## Compatibility

The `users` section id, the `.contest-user-row` list markup, the row action
menu and the access dialog keep their current contract so the existing
production browser QA remains valid. Segments and the client card are added
around them.

## Rollback

Revert the release. The two new tables and indexes are additive and unused by
older code; they can stay in place.
