# Card controls and public profiles

## Objective

Improve constructed-card detail controls and add privacy-safe public user profiles:

- hide the Standard statistics option on Wild card pages when the card metadata
  explicitly excludes Standard;
- present card-statistics history as a collapsed disclosure and defer its request
  until the reader opens it;
- assign every existing and future account a stable, non-guessable public profile
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

### Public profiles

- Canonical route: `/profiles/:publicProfileId/`.
- Public IDs use cryptographically random bytes, are immutable, unique, and are
  separate from the internal account ID used for authentication and
  authorization.
- Existing users are backfilled during the idempotent database migration.
- New users receive an ID during persistence.
- The private profile shows the full public ID and a link to the public page.
- The public API allowlist contains only:
  `publicProfileId`, `name`, `avatarInitials`, and `createdAt`.
- Public responses exclude email, contacts, country, role, subscription state,
  provider identifiers, blocked state, and internal IDs.
- A public ID is never accepted by a mutation or authorization path.
- Invalid, blocked, or missing profiles return the same generic not-found
  response.
- Public profile pages are accessible without authentication but use
  `noindex,follow` by default to reduce unintended discoverability.

## Verification

- Unit/route tests for format visibility, disclosure behavior, public-ID
  validation/backfill, public API allowlisting, invalid IDs, and blocked users.
- Existing auth/profile and constructed-card suites remain green.
- Typecheck, production build, Storybook contract/build, Semgrep, Gitleaks, and
  changed-React checks pass.
- Browser verification covers desktop and mobile layouts, keyboard disclosure,
  direct public-profile navigation, console errors, and API response contents.
- Production smoke test covers health, one Wild-only card, and one generated
  public profile URL.

## Rollback

The database column and unique index are additive. Rolling back application code
does not require deleting them. The frontend and public GET endpoint can be
reverted independently without data loss.
