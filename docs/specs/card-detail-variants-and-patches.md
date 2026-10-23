# Card detail: versions and patch history

## Versions

`src/shared/ui/CardVariantSwitch.tsx` is the one switch for card versions on
the Standard/Wild card page (Обычная · Золотая · Сигнатурная) and the
Battlegrounds minion page (Обычная · Золотая).

- A `radiogroup` of `button role="radio"`; arrow keys move the choice.
- The thumb glides to the chosen version over `--motion-base` (transform
  only). `CardVariantImages` stacks every version in one box: all load at
  once and the switch only cross-fades opacity, so the new version is there
  immediately and the box keeps its size. Reduced motion switches in place.
- A Battlegrounds minion shows the full card in both versions: normal is the
  512 px HearthstoneJSON render of the base card id, golden is
  `golden/<base id>.png`. `_G` renders are never used: HearthstoneJSON has
  none, and the cached one shows another card.

## Patch history

`src/features/cardPatchChanges.ts` turns the wiki's change lines into short
Russian lines with a direction (усиление, ослабление, добавлена, изменение);
flavor text, unlock requirements, Duels and animation notes fold into a
quiet line. `CardPatchTimeline` shows them newest first with the patch
version, date, the Manacost article and the wiki page. Unknown lines keep the
wiki text.

## Checks

- `tests/card-patch-changes.test.ts`: translations, directions, minor notes.
- `tests/battleground-card-variants.test.ts`: the minion image sources.
- `tests/data-visualizations.test.ts`: chart date labels never overlap.
