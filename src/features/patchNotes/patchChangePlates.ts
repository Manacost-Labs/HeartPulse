import type { PatchCardView, PatchChangeView, PatchDirection } from '../../modules/patchNotes/public';

/** One short plate of a change: «Мана 9 → 10». A rule-text change is the plate «Текст» with its texts apart. */
export type ChangePlate = {
  label: string;
  before: string | null;
  after: string | null;
  direction: PatchDirection;
  /** Old and new rule text; the page shows them, the changed words marked, only where no picture of the card shows the text. */
  text: { before: string | null; after: string | null } | null;
};

const LONG_TEXT = 12;

const isText = (change: PatchChangeView) => change.label === 'Текст' || (typeof change.before === 'string' && change.before.length > LONG_TEXT)
  || (typeof change.after === 'string' && change.after.length > LONG_TEXT);

/** The game's own words for the numbers: a Battlegrounds cost is gold, a tavern level is a tier. */
function plateLabel(change: PatchChangeView, mode: PatchCardView['mode']): string {
  if (change.label === 'Стоимость') return mode === 'battlegrounds' ? 'Золото' : 'Мана';
  if (change.label === 'Уровень таверны') return 'Тир';
  return change.label;
}

export function changePlates(card: Pick<PatchCardView, 'mode' | 'changes'>): ChangePlate[] {
  return card.changes.map(change => {
    const text = isText(change);
    return {
      label: text ? 'Текст' : plateLabel(change, card.mode),
      before: text || change.before === undefined ? null : String(change.before),
      after: text || change.after === undefined ? null : String(change.after),
      direction: text ? 'neutral' : change.direction,
      text: text ? { before: change.before === undefined ? null : String(change.before), after: change.after === undefined ? null : String(change.after) } : null,
    };
  });
}
