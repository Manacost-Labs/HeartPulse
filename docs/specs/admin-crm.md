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

## Money section (phase 2)

`/admin?section=money` («Деньги») reads the existing
`GET /api/admin/boosty/analytics?from&to` for 30 days, 90 days or a year and
shows:

- totals: subscription revenue (new subscriptions and renewals), Boosty
  donations and paid posts, average subscription payment and observed
  decreases (refunds and downgrades);
- revenue per day (up to 31 days), per Monday-based week (up to 120 days) or
  per month, with every bucket present so gaps stay visible; periods start at
  the beginning of a UTC day, so only today's bucket is partial;
- revenue per subscription level with its share, retention after 30, 60 and
  90 days, top Boosty buyers and the latest sales.

Subscription revenue is inferred from observed Boosty payment increases plus
exact Tribute webhooks, so the page lists every data-quality caveat from the
payload (incomplete polling, unavailable Tribute or sales ledger) above the
numbers. When the sales ledger is unavailable, donations and posts show «—»
instead of zero. The loader requests at most 500 sales rows; when that limit
is reached the chart is marked incomplete while the totals stay exact.

The KolodaHearthstone article catalogue only annotates the analytics. If it is
unavailable, the endpoint still returns revenue with empty `articleIntervals`
and a limitation, instead of failing with `502`.

The previous article-interval analytics page (`ContestAdminAnalytics`), removed
from navigation on 2026-09-13, is deleted together with its model.

## Overview (phase 2)

`/admin?section=dashboard` («Обзор») is the admin landing page. It reads
`GET /api/admin/crm/overview`, which the server caches for 60 seconds
(`?fresh=1`, sent by «Обновить», bypasses the cache), and the 30-day money
analytics for the revenue card. The revenue request is independent: alerts
and the other cards render without waiting for Boosty or Tribute.

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

The revenue card requests `/api/admin/boosty/analytics` with `articles=0`,
which skips the KolodaHearthstone article catalogue.

## Referral funnel (phase 3)

Clicks on campaign links (`/r/:slug` and `POST /api/referrals/track/:slug`)
now also set a first-party cookie `hp_ref=<referralId>.<clickId>.<clickedAtMs>`
(`Path=/`, `Max-Age` 30 days, `HttpOnly`, `SameSite=Lax`, `Secure` on
https). No personal data is stored in it.

`server/referralAttribution.ts` runs as an `/api/` middleware. When a request
carries the cookie and is authenticated, the account is linked to the
campaign in `user_referrals(user_id, referral_id, click_id, clicked_at,
attributed_at)` if it was created no earlier than ten minutes before the
click, and the cookie is cleared either way. Existing accounts and unknown or
malformed cookies are never attributed; a first attribution is never
overwritten. Anonymous requests keep the cookie until sign-in. Registration
code paths are untouched, so every sign-up method is covered.

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
