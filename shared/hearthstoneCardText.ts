// Hearthstone writes counted nouns as `2 |4(ход,хода,ходов)`: the game picks the
// form for the number before the marker. Russian has three forms (one, few,
// many), English two (one, other). The card catalog serves some texts with the
// markup intact and some with the number and marker already stripped, leaving
// a bare `(ход,хода,ходов)`; HearthstoneJSON keeps the original.

const PLURAL_MARKUP = /\|4\(([^()]*)\)/g;
const BARE_GROUP = /\(([^()|]*)\)/g;

function pluralIndex(count: number, forms: number): number {
  if (forms < 3) return count === 1 ? 0 : 1;
  const ones = count % 10;
  const tens = count % 100;
  if (ones === 1 && tens !== 11) return 0;
  if (ones >= 2 && ones <= 4 && (tens < 12 || tens > 14)) return 1;
  return 2;
}

function plainText(markup: string): string {
  return markup.replace(/<[^>]*>/g, '').replace(/\[x\]/gi, '');
}

function splitForms(group: string): string[] {
  return group.split(',').map(form => form.trim());
}

function formsKey(forms: string[]): string {
  return forms.map(form => plainText(form).replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru')).join(',');
}

/** The number the marker at `index` counts, or null when it counts a game placeholder (`{0}`, `@`) or nothing. */
function countBefore(text: string, index: number): number | null {
  const tokens = plainText(text.slice(0, index)).match(/\{\d+\}|@|\d+/g);
  const last = tokens?.at(-1);
  return last && /^\d/.test(last) ? Number(last) : null;
}

/** Replaces every `|4(…)` marker with the form for the number before it (the last form when there is none). */
export function renderCardPlurals(text: string): string {
  if (!text.includes('|4(')) return text;
  return text.replace(PLURAL_MARKUP, (markup, group: string, offset: number) => {
    const forms = splitForms(group);
    if (forms.length < 2) return markup;
    const count = countBefore(text, offset);
    return forms[count === null ? forms.length - 1 : pluralIndex(count, forms.length)];
  });
}

/**
 * Restores bare `(one,few,many)` groups whose number and marker were stripped,
 * taking each number from the original text of the same card.
 */
export function restoreCardPlurals(text: string, original: string | null | undefined): string {
  if (!original?.includes('|4(') || !text.includes('(')) return text;
  let restored = text;
  let searchFrom = 0;
  for (const marker of original.matchAll(PLURAL_MARKUP)) {
    const count = countBefore(original, marker.index ?? 0);
    if (count === null) continue;
    const key = formsKey(splitForms(marker[1]));
    BARE_GROUP.lastIndex = searchFrom;
    let bare: RegExpExecArray | null;
    while ((bare = BARE_GROUP.exec(restored))) {
      const forms = splitForms(bare[1]);
      if (restored.slice(bare.index - 2, bare.index) === '|4' || forms.length < 2 || formsKey(forms) !== key) continue;
      const before = restored.slice(0, bare.index);
      const keepsNumber = new RegExp(`(?:^|\\D)${count}[\\s\\u00a0]*$`).test(plainText(before));
      const replacement = `${keepsNumber ? '' : `${count} `}${forms[pluralIndex(count, forms.length)]}`;
      restored = before + replacement + restored.slice(bare.index + bare[0].length);
      searchFrom = bare.index + replacement.length;
      break;
    }
  }
  return restored;
}

/** Card rules text as players read it: stripped counts restored from the original, markers rendered. */
export function cardRulesText(text: string, original?: string | null): string {
  return renderCardPlurals(restoreCardPlurals(text, original));
}

/** `renderCardPlurals` for a value that may not be a string, as raw catalog fields are. */
export function renderTextPlurals<T>(value: T): T {
  return (typeof value === 'string' ? renderCardPlurals(value) : value) as T;
}
