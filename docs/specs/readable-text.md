# Readable text

## Rule

11px (`0.6875rem`) is the smallest text the site sets, on every viewport.
Apple's Human Interface Guidelines and Material Design both treat 11 as the
floor for caption text; below it Cyrillic uppercase labels on parchment become
hard to read on a phone.

- Site stylesheets (`src/**/*.css`, `apps/**/*.css`, not `src/vendor/`) use at
  least `0.6875rem` or `11px` for `font-size`, and Tailwind arbitrary sizes in
  TSX at least `text-[11px]`.
- `<small>` uses `max(0.6875rem, 0.8em)` (`src/index.css`): inside an 11px
  label the browser default `smaller` produced 8.8px.
- Size hierarchy for labels comes from weight, case, colour and tracking, not
  from going below the floor.

## History

On 2026-10-23 a production audit at 320, 390 and 1440 px found labels from
6.9px (fun-deck metrics) to 10.9px on the home page, the Standard meta,
archetypes, card catalogue and detail, fun decks and articles. 295 rules in 50
stylesheets and three Tailwind sizes were raised to the floor. The same audit
after the change found no horizontal overflow or clipped element on any of the
26 main pages at any of the three widths.

## Checks

`tests/readable-text.test.mjs` fails on a new size below the floor.
