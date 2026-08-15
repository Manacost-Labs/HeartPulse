<!-- markdownlint-disable MD013 -->

# Design QA — shared compact read-only deck lists

## Target and evidence

- Visual targets: supplied HSGuru deck page and the reported pale-strip
  production screenshot.
- Reference: `/tmp/fun-decks-audit-20260801/02-hsguru-reference.png`.
- Reported strip screenshot:
  `/home/debian/.codex/attachments/94e9901d-138c-41ee-baf0-f5ea8e76505e/codex-clipboard-384936aa-d27a-445f-b85c-4b1101108f10.png`.
- Current Fun Decks implementation:
  `/tmp/manacost-soft-paywall-1477760-fun-decks-wide.png`.
- Current archetype implementation:
  `/tmp/manacost-archetypes-1477798-detail-desktop.png` and
  `/tmp/manacost-archetypes-1477798-detail-mobile.png`.
- Same-input comparison: `/tmp/fun-decks-audit-20260801/compare-round-1.png`.
- Compared slot: approximately `214–220px` wide deck panels at the same desktop viewport.

## Acceptance criteria

- Six deck panels remain visible in one wide row.
- Every main-deck and sideboard entry is rendered without a reveal control.
- Row density is smaller than the supplied HSGuru reference.
- Mana, rarity, art fade, names and count boxes remain aligned and legible.
- Pale source-tile edges stay underneath the opaque portion of the fade.
- Archetype galleries, archetype details, meta composition and card details use
  the same compact geometry without page-local density overrides.
- Narrow screens have no document-level horizontal overflow.
- Touch actions remain at least `44px` high on mobile.

## Comparison history

### Round 1

- HSGuru reference rows measured at about `28.8px`; implementation rows render
  at `29px`.
- The implementation retains the site's parchment, wood and class header while
  matching the reference deck-list density.
- Main deck, sideboard heading, sideboard rows and copy action are all visible.
- No clipped mana blocks, blank gutters, broken art transitions or hidden deck
  rows were found in the combined comparison.

### Round 2

- The user screenshot exposed light left edges already embedded in several
  upstream HearthstoneJSON `256×59` tile images.
- Compact row height was reduced from `29px` to `25px`.
- Artwork width was changed from source `auto` sizing to 90% of the compact
  frame, so the source tile's light edge ends before the fade becomes
  transparent.
- The new desktop screenshot shows continuous dark-to-art transitions and no
  exposed pale strip in the compact test composition.

### Round 3

- The compact geometry, typography, fade and art crop moved into the shared
  non-interactive `DeckListView` contract.
- Archetype gallery rows reduced from `40px` to `25px`; mana blocks now match
  the row height, count boxes are `18px`, and counted-card art ends `16px` from
  the right.
- Browser screenshots confirm the main archetype build and the complete
  “Другие сборки архетипа” grid remain aligned on desktop and mobile.
- The deck builder still renders `44px` interactive rows.

## Automated checks

- Desktop: six columns, each at least `210px` wide.
- Fixture: 17 main-deck rows and three sideboard rows per deck.
- Compact row height: at most `26px`.
- Artwork coverage: at least 88.9% of its frame.
- Archetype desktop/mobile row and mana block: exactly `25px`.
- Interactive builder row: exactly `44px`.
- Complete card height: at most `820px` for the 20-row fixture composition.
- Mobile: no overflow at `390px` or `320px`.
- Accessibility: no serious or critical Axe violations.

## Final result

passed
