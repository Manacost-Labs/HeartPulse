# App usage limits

## Objective

Part of the Hearthpulse desktop app's analytics is free for a few games a day
and unlimited with a subscription, as in Firestone (plan 3.1). The site counts
the games, so the limit holds across installs; the app works on its own when
the site cannot be reached. Only the site's own analytics may be limited:
numbers from the Hearthpulse stats pool. Third-party data (HSReplay, HSGuru,
ArenaSmith) and Blizzard's cards and art are never behind the limit.

## Features

- `bg.poolStats`, section `battlegrounds`: the Battlegrounds overlay numbers
  from the stats pool — top comps on the hero pick, buy hints by comp, trinket
  stats.

A subscriber whose subscription opens the section (Boosty, Patreon, Telegram
or a manual grant: `readSubscriptionStatus`) has no limit. A game counts once,
the first time the app has numbers of the feature to show in it.

## Switch

Off unless `APP_USAGE_LIMITS_ENABLED=1`: every claim is then allowed, nothing
is stored and the app limits nothing. `APP_USAGE_FREE_PER_DAY` (1–100, default
3) sets the free games per feature and UTC day without an app release.

## Data

Table `app_usage_claims` (`server/modules/appUsage/repository.ts`): `user_id`
(FK `users`, `ON DELETE CASCADE`), `day` (UTC, `YYYY-MM-DD`), `feature`,
`game_id` (a random UUID the app makes per game: not a time, not a name),
`created_at`; primary key over the first four, so a game counts once. Kept 7
days (`APP_USAGE_KEEP_DAYS`), pruned a minute after start and once a day where
background jobs run. A subscriber's claims are not stored.

## API

All under `/api/v1/usage`, 120 requests a minute per address.

- `GET /limits` — public, `Cache-Control: public, max-age=300` →
  `{ enabled, day, resetsAt, features: { key: { section, freePerDay } } }`.
- `GET /` — Bearer with `subscription.read` → the same plus
  `usage: { key: { unlimited, used, limit } }`.
- `POST /claim` — Bearer with `subscription.read`, body `{ feature, gameId }`
  → `{ feature, allowed, unlimited, used, limit, resetsAt }`. 400 for an
  unknown feature or a game id that is not a UUID, 401/403 without a token or
  the scope. Off or a subscriber: `allowed: true, unlimited: true`. A game
  already counted today: allowed, not counted again. Otherwise allowed while
  `used < limit` (then counted), else `allowed: false`.

## Privacy

`src/modules/legalPages/content.json`, section 6: what is counted (account,
day, feature, a random game number), that subscribers are not recorded, 7 days,
deleted with the account.

## App

Hearthpulse `docs/usage-limits.md`: the overlay gate, the offline and
signed-out soft mode (local count), the note when the limit is reached.
