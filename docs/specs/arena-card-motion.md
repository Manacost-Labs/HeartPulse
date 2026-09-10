# Arena cards and class chart motion

## Objective

Keep Arena tier-list cards stable when image sources have different intrinsic
dimensions or no image is available, while reducing motion in the class
win-rate chart.

## Acceptance criteria

- Every `HSCard` owns a 512:776 frame; source images fill that frame with
  `object-fit: contain`, and the fallback uses the same frame.
- Fine-pointer hover may lift a card by at most 2 px and scale it by at most
  1.02. Rarity drop-shadow glow, focus preview and touch/static behavior stay
  intact.
- Class rows have no entrance stagger or hover movement. Their fill uses a
  transform-only transition no longer than 400 ms, while a contrast-backed
  percentage chip stays visible outside the transformed layer from first render.
- `prefers-reduced-motion` disables card and fill transitions.

## Verification

Meter animation and label styles belong to `WinrateMeterFill.css`, loaded with
the Arena route instead of enlarging the shared parchment stylesheet. Fixed
layers are not promoted with permanent `will-change` after the entrance ends.

`tests/arena-card-motion.browser.test.mjs` renders portrait, wide and fallback
cards in Storybook, measures their computed geometry, and checks chart and
reduced-motion styles in Chromium.
