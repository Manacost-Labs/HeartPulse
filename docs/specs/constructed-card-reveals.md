# Standard card reveal import

## Objective

Publish collectible cards already revealed for Blizzard's “Reign of the Black Empire” (“Власть Темной империи”) in the Standard card catalog before the expansion becomes playable. A card with a stable DBF ID and a public name may have a page even when its rules, image, type, rarity, class or statistics are incomplete.

## Source and schedule

The existing `kolodahs-sync-constructed-cards.timer` runs every four hours. Its `sync_constructed_cards.py` job continues to use Blizzard Game Data API `set=standard` for playable cards. In the same run it reads the official public card-library JSON for `set=reign-of-the-black-empire` in Russian and English. The gallery endpoint is an observed website interface, so import must fail closed on pagination, set membership, identity or response-shape changes. It must not enumerate HearthstoneJSON's full unreleased catalog.

## Publication contract

- Import only collectible entries returned by the official expansion gallery with a positive DBF ID and a public name in at least one locale. An absent translation does not become a fabricated translation.
- Store missing optional fields as missing; retain previously known values if a later reveal response omits them. New facts fill those gaps on later runs.
- Keep the preview record in the Standard catalog, distinguish its availability from playable cards in storage, and never assign statistics that the statistics source did not provide.
- Prefer the normal Game Data API record once it identifies expansion set ID `1994`. A DBF may appear in `set=standard` earlier without that membership; the gallery identifies its expansion and it remains a preview. A temporary `blizzard:<dbf>` identity may migrate to a canonical HearthstoneJSON card ID using the existing migration path.
- A failed, truncated or contradictory gallery response must not remove previously published preview cards. Existing catalog continuity checks remain in force.
- A public detail page requires a valid identity and a name. Missing optional data is shown by the existing page fallbacks.

## Verification

- Unit tests use fixture responses and a fake database; they make no live Blizzard requests.
- Exercise bilingual gaps, optional-field preservation, pagination and malformed-source rejection, preview-to-playable promotion, and removal safety.
- Run the focused importer tests, `make check`, `make security`, and the site's constructed-card and public-read-model tests before integration.
- After an authorized release, check the source count, imported preview count, a sample detail page, and the next timer run without logging credentials.

## Boundaries

No database schema change, new paid scrape provider, release-date-based client switch or production secret is needed. Code remains in the existing importer and public card contracts. Deployment, Git publication and the required public changelog post require separate explicit authorization.
