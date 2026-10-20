# Arena cards and class chart motion

## Objective

Keep Arena tier-list cards stable when image sources have different intrinsic
dimensions or no image is available, while reducing motion in the class
win-rate chart.

## Acceptance criteria

- Every `HSCard` owns a 512:776 frame; source images fill that frame with
  `object-fit: contain`, and the fallback uses the same frame. Every card in
  a row shares one width, height and top in every tier, at phone and desktop
  widths; legendary dragon frames stay inside the frame.
- Blizzard renders (the `/api/card-image` proxy and `imageRu`) draw a
  location frame edge to edge, about 16% taller than a minion, spell or
  weapon body. Such a card carries `data-card-frame="location"` and its image,
  not its frame, is scaled to 0.86, so a location shows at a minion's size and
  the grid never moves. HearthArena and HearthstoneJSON renders are not scaled.
- Hover and keyboard focus show the card library's rarity glow: a blurred
  plate behind the art, coloured by `data-rarity` from the shared
  `--card-rarity-glow-*` tokens in `src/styles/tokens.css`. Only its opacity
  and transform animate; the art is never recoloured.
- Fine-pointer hover may lift a card by at most 2 px and scale it by at most
  1.02. Focus preview and touch/static behavior stay intact.
- Class rows have no entrance stagger or hover movement. Their fill uses a
  transform-only transition no longer than 400 ms, while a contrast-backed
  percentage chip stays visible outside the transformed layer from first render.
- `prefers-reduced-motion` disables card and fill transitions.
- Forced-colors mode uses system canvas/text colors for percentage labels;
  focused axe contrast checks and the canonical 200% reflow audit cover it.

## Verification

Meter animation and label styles belong to `WinrateMeterFill.css`, loaded with
the Arena route instead of enlarging the shared parchment stylesheet. Fixed
layers are not promoted with permanent `will-change` after the entrance ends.

`tests/arena-card-motion.browser.test.mjs` renders portrait, wide and fallback
cards in Storybook, measures their computed geometry, and checks chart and
reduced-motion styles in Chromium.

`tests/arena-tier-card-geometry.browser.test.mjs` opens the tier list with real
spell, minion, location and legendary renders at 1440×900 and 412×915. It
checks one card box per row and tier, the opaque art inside each box, a
location as tall as a minion, the rarity glow colour and its hover/focus
reveal, lazy images below the first tier, no layout shift and no horizontal
scroll.
