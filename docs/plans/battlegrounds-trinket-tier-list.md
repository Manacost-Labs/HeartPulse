# Battlegrounds trinket tier list panel

## Goal

Make the trinket tier list readable as a complete statistical table while
preserving the existing Battlegrounds parchment visual language.

## Acceptance criteria

- Every trinket in each tier is present in the initial document; the trinket
  view has no `Show more` action.
- Each row contains the mirrored full art inside the supplied trinket frame,
  localized title and description, pick rate, average placement, and the 1–8
  placement distribution. The same full art is reused as a darkened row
  backdrop.
- Hovering or keyboard-focusing a row opens a large non-interactive tooltip
  containing only the transparent localized card render.
- The supplied Hearthstone controls switch between the statistical table and
  a card gallery; `view=table|gallery` keeps the selected mode shareable and
  restorable. Every gallery card repeats the pick rate, average placement, and
  compact 1–8 placement distribution so switching views never hides
  statistics.
- Clicking a row continues to open the existing lightbox. Trinket previews
  use a compact 672px lightbox profile and a 320px hover card so the card and
  description remain visible without dominating the viewport.
- Full-art images are lazy-decoded, rows use rendering containment, and
  non-trinket tier lists retain their current pagination.
- The layout collapses cleanly on narrow screens, where the hover tooltip is
  suppressed and the lightbox remains available.

## Data contract

The existing `/api/bg/tier-lists?list=trinkets` response remains authoritative.
The UI consumes `id`, localized names/text, `cost`, `pickRate`,
`avgPlacement`, `games`, `race`, and `placementDistribution`. Full art is read
from the local mirror at
`db.kolodahs.ru/uploads/library-full-art/{cardId}.png`. Transparent localized
card renders use `bg.kolodahearthstone.ru/api/card-art`; both sources are
delivered through Arena's bounded same-origin public-resource proxy.

## Verification

- Unit-contract coverage for full-list behavior, URL mode normalization,
  proxied full-art/card URL construction, and placement-bar normalization.
- TypeScript and production build.
- Semgrep changed-file scan.
- Desktop and mobile browser review of the exact user URL, including hover,
  keyboard focus, lightbox, and absence of `Show more`.
