# Public player statistics by opt-in

- Status: accepted
- Date: 2026-11-05

## Context

Players asked to share their profile so that others can see their decks and
statistics. The public profile (`/id/<n>/`) deliberately shows only a short
allow-list ([restore public profiles](2026-10-23-restore-public-profiles.md));
the tracker games behind «Моя статистика» are personal data that the desktop
application sent for the owner alone. Public IDs are sequential, so anything
public by default can be collected for every account.

## Decision

- The statistics and decks become public only after the owner switches on
  «Моя статистика и колоды» in the account (`users.public_stats_visible`,
  `0` for every existing and new account).
- The public profile gains one allow-listed flag, `showsStats`.
- The statistics are served at `/api/profiles/<id>/game-stats[/modes]` as a
  public copy: only games before the start of the current UTC day (period
  windows end there too), tracker identifiers become positions, times are
  rounded to the UTC day, mode counts are presence only, and there is no
  global comparison. The answer is therefore the same for every viewer, may
  be cached for 60 seconds, and polling it does not reveal when someone plays.
- Hidden, blocked, missing and malformed profiles answer the same `404`.

## Consequences

- A visitor learns on which days someone played, their decks, results, ranks
  and ratings, but not at what time they play or any stored identifier.
- The public statistics lag by up to a day: today's games appear tomorrow.
- Switching off takes effect for new readers within a minute (the cache).
- Paid global comparisons stay with the owner's own view; a visitor's
  subscription does not change the public answer.
- The routes exist only while `PLAYER_STATS_ENABLED=1`, like the owner's.
