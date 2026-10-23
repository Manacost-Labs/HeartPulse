# Card controls and public profiles

## Objective

Improve constructed-card detail controls and add privacy-safe public user profiles:

- hide the Standard statistics option on Wild card pages when the card metadata
  explicitly excludes Standard;
- present card-statistics history as a collapsed disclosure and defer its request
  until the reader opens it;
- assign every existing and future account a stable numeric public profile
  identifier and public URL.

## Technical context

- React 19 and TypeScript frontend
- Express 4 API
- Node SQLite database
- Existing parchment/burgundy visual language and native responsive shell

## Product behavior

### Card detail

- The Wild statistics option remains available.
- Standard is hidden only when `card.formats` is present and does not contain the
  Standard format.
- Missing format metadata preserves the current two-option fallback.
- “Динамика карты” is a native disclosure, closed by default, keyboard operable,
  and fetches history only after opening.

### Card history (“Динамика карты”)

- Snapshots before the card's first sampled snapshot are “no data yet”, not
  zeros: a snapshot is sampled when it has a deck winrate or at least 100
  plays (the statistics source publishes winrates only from 100 plays, so a
  pre-release card shows 0–3 stray plays and 0% popularity). Later small
  samples stay on the line: a card leaving the meta is real information.
- Change, minimum and maximum use only real values of the shown range. With
  fewer than three real values the block shows a short note (“Мало данных:
  карта отслеживается с 20 окт…”, or “Мало игр…” before the first sample) and
  the current value instead of a chart.
- Histories within three calendar days plot every refresh, labelled with its
  time (“21 окт, 08:36”); longer ones plot the last snapshot of each day, and a
  day without snapshots breaks the line instead of bridging it.
- Range buttons (30/90/180 days) are offered up to the first range that already
  shows the whole history; longer ones are disabled. A history shorter than 30
  days offers no range choice. The start date (“данные с …”) is always shown.
- Winrate when played carries a Wilson 95% band from its play count; deck
  winrate has no known game count and no band.
- Winrate metrics can be compared with the play-weighted average of sampled
  cards of the card's class and of the whole format at the same snapshots. The
  switch appears only when an average has at least two shown snapshots.
- `GET /api/constructed-cards/:cardId/history` additionally returns
  `trackedSince` (the first snapshot in the slice, beyond the requested range)
  and `references` (`scope`, `label`, `points`). Both are paid data: a reader
  without statistics access receives `null` and `[]`. Points are capped at the
  newest 1000 snapshots of the range.

### Public profiles

Public profiles were removed and restored on 2026-10-23 with nicknames and a
narrower field list. Their contract lives in
[`public-profiles.md`](public-profiles.md).

### Future saved decks

- Saved decks must reference the internal user ID with a database foreign key.
- The numeric public ID is a presentation identifier only. It can be used in a
  deck owner's public URL, but never as the ownership or authorization key.
- Public deck serializers must have their own explicit field allowlist.

## Verification

- Unit/route tests for format visibility, disclosure behavior, public-ID
  validation/backfill, public API allowlisting, invalid IDs, and blocked users.
- Existing auth/profile and constructed-card suites remain green.
- Typecheck, production build, Storybook contract/build, Semgrep, Gitleaks, and
  changed-React checks pass.
- Browser verification covers desktop and mobile layouts, keyboard disclosure,
  console errors, and API response contents.
- `tests/next-public-profiles-browser.test.mjs` covers the restored profile
  pages and the account nickname flow.
- Production smoke test covers health, one Wild-only card, and a `404` for a
  former public profile URL.

## Rollback

The database column and unique index are additive. Rolling back application code
does not require deleting them. The frontend and public GET endpoint can be
reverted independently without data loss.
