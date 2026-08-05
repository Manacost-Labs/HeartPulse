# Battlegrounds trinket tier list panel

## Goal

Make the trinket tier list readable as a complete statistical table while preserving the existing Battlegrounds parchment visual language.

## Acceptance criteria

- Every trinket in each tier is present in the initial document; the trinket view has no `Show more` action.
- Each row contains the mirrored full art inside the supplied trinket frame, localized title and description, pick rate, average placement, and the 1–8 placement distribution.
- Hovering or keyboard-focusing a row opens a non-interactive tooltip with the localized card render and the same core metrics.
- Clicking a row continues to open the existing lightbox.
- Full-art images are lazy-decoded, rows use rendering containment, and non-trinket tier lists retain their current pagination.
- The layout collapses cleanly on narrow screens, where the hover tooltip is suppressed and the lightbox remains available.

## Data contract

The existing `/api/bg/tier-lists?list=trinkets` response remains authoritative. The UI consumes `id`, localized names/text, `cost`, `pickRate`, `avgPlacement`, `games`, `race`, and `placementDistribution`. Full art is read from the local mirror at `db.kolodahs.ru/uploads/library-full-art/{cardId}.png`; the card render continues through the existing optimized image path.

## Verification

- Unit-contract coverage for full-list behavior, full-art URL construction, and placement-bar normalization.
- TypeScript and production build.
- Semgrep changed-file scan.
- Desktop and mobile browser review of the exact user URL, including hover, keyboard focus, lightbox, and absence of `Show more`.
