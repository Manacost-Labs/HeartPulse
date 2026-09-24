# Standard card reveal import

## Objective

Publish collectible cards revealed for Blizzard's “Reign of the Black
Empire” (“Власть Темной империи”) in the Standard catalog before the
expansion becomes playable. A card with a stable DBF ID and a public
name may have a page while its rules, image, type, rarity, class or
statistics are incomplete.

## Source and schedule

The existing `kolodahs-sync-constructed-cards.timer` runs every four
hours. Its `sync_constructed_cards.py` job uses Blizzard Game Data API
`set=standard` for playable cards. In the same run it reads the official
card library JSON for `set=reign-of-the-black-empire` in Russian and
English. Standard and Wild share card records, so both format imports
enrich their existing cards from the gallery. Only Standard adds cards
that appear in the gallery but not in Game Data.

The gallery endpoint is an observed website interface. Import must
fail closed on pagination, set membership, identity or response shape
changes. It must not enumerate HearthstoneJSON's unreleased catalog.

## Publication contract

- Import collectible gallery entries with a positive DBF ID and a
  public name in at least one locale. Do not fabricate a translation.
- Store missing optional fields as missing. Retain known preview values
  if a later response omits them. Fill gaps on later runs.
- Keep previews in the Standard catalog and distinguish their
  availability from playable cards in storage. Never invent statistics.
- Prefer the normal Game Data record once it identifies expansion set
  ID `1994`. Fill its missing public fields, including art, from the
  gallery. A DBF may appear in `set=standard` earlier without that set
  ID; the gallery identifies its expansion and it remains a preview.
- A temporary `blizzard:<dbf>` identity may migrate to a canonical
  HearthstoneJSON card ID through the existing migration path.
- A failed, truncated or contradictory gallery response must not
  remove previously published previews. Catalog continuity checks
  remain in force.
- A public detail page requires an identity and a name. Existing page
  fallbacks display missing optional data.

## Verification

- Unit tests use fixtures and a fake database. They make no live
  Blizzard requests.
- Exercise bilingual gaps, optional fields, pagination, malformed
  source rejection, preview promotion and removal safety.
- Run focused importer tests, `make check`, `make security`, and the
  site's constructed card and public read model tests.
- After release, compare source and catalog counts, inspect a detail
  page, and check the next timer run without logging credentials.

## Boundaries

No database schema change, paid scrape provider, release date based
client switch or production secret is needed. Code remains in the
existing importer and public card contracts. Deployment, Git
publication and the public changelog post need explicit authorization.
