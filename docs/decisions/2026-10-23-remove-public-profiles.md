# Remove public profile pages

## Status

Accepted on 2026-10-23. Supersedes the public-route part of
[007. Numeric public profile identities](007-numeric-public-profile-identities.md).

## Context

The owner asked to remove the public profile feature. The pages at
`/id/:id/` and `/profiles/p_…/` showed a player card that nobody needed, kept a
second identity surface to maintain and test, and invited people to share a
link to their account. The numeric account ID behind those pages is also used
by connected applications (Deckview through the application profile and the
Reader API), so it cannot simply disappear.

## Decision

- Delete the Next.js pages, the client profile card, the `GET /api/profiles/:id`
  route and its SQLite lookup.
- Remove «Публичный профиль» and «Копировать ссылку» from the account page.
- Keep `users.public_numeric_id`, its assignment and backfill, and the
  `publicProfileId` field of connected-application profiles. `profileUrl`
  keeps its type and same-origin form but points to the account page
  `/profile/`.
- Leave Nginx untouched: the former addresses still reach Next, which answers
  its normal `404` with `noindex`. Changing the reviewed Nginx contract would
  need a new deployer hash for no user-visible gain.
- Delete no stored data.

## Consequences

- Old shared profile links show the site's 404 page instead of a player card.
- The public route inventory keeps both patterns as retired `404` routes so
  routing and SEO tests document the behaviour.
- Restoring the feature means restoring the deleted files from Git history;
  the data it needs still exists.
