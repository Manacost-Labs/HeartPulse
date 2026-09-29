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
dashboard and navigation.

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

| id | Label | Rule |
| --- | --- | --- |
| `all` | Все | every user |
| `paying` | Платят сейчас | cached provider access (`subscriptions.has_access = 1`) |
| `manual` | Ручной доступ | active manual grant (no expiry or expiry in the future) |
| `expiring` | Истекает ≤ 7 дней | active manual grant that expires within 7 days |
| `lapsed` | Потеряли доступ | no provider or manual access now, but a `subscription_checks` row with access in the last 30 days |
| `new` | Новые за 7 дней | `users.created_at` within 7 days |
| `blocked` | Заблокированы | `users.blocked_at` is set |
| `admins` | Администраторы | `users.role = 'admin'` |

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
    source: string,              // cached provider source ('boosty', 'telegram', ...); an active manual grant adds 'manual-access' ('none' becomes 'manual-access')
    message: string,
    checkedAt: string,
    manual: null | { active, grantedBy, grantedAt, expiresAt, revokedBy, revokedAt, note },
  },
  accessHistory: Array<{ at, source, hasAccess }>,  // per-provider flips, newest first, max 50
  contests: Array<{ contestId, title, status, createdAt }>,
  mailing: null | { consentStatus, consentedAt, unsubscribedAt, delivered, failed, lastDeliveredAt },
  notes: Array<{ id, body, authorId, authorName, createdAt }>,
  tags: string[],
  audit: Array<{ id, action, actorId, actorName, details, createdAt }>,  // max 50
}
```

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
