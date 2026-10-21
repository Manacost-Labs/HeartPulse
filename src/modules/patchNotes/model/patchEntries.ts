import type { PatchNotesChange, PatchNotesDetail, PatchNotesEntry } from './types';

/** A section of the patch view: a class, Arena or Battlegrounds. */
export type PatchSection = { id: string; title: string };

/** One entry in the shape of VaryloUI `PatchEntry`, which the feature view renders. */
export type PatchEntry = {
  id: string;
  name: string;
  image?: string;
  subtitle?: string;
  section?: string;
  kind?: 'rework';
  changes: PatchNotesChange[];
  note?: string;
};

const CLASS_LABELS: Record<string, string> = {
  DEATHKNIGHT: 'Рыцарь смерти',
  DEMONHUNTER: 'Охотник на демонов',
  DRUID: 'Друид',
  HUNTER: 'Охотник',
  MAGE: 'Маг',
  PALADIN: 'Паладин',
  PRIEST: 'Жрец',
  ROGUE: 'Разбойник',
  SHAMAN: 'Шаман',
  WARLOCK: 'Чернокнижник',
  WARRIOR: 'Воин',
  NEUTRAL: 'Нейтральные',
};
const CLASS_ORDER = Object.keys(CLASS_LABELS);

export const ARENA_SECTION: PatchSection = { id: 'arena', title: 'Арена' };
export const BATTLEGROUNDS_SECTION: PatchSection = { id: 'battlegrounds', title: 'Поля сражений' };

/** Card picture through the site's card-image proxy; the full card shows the current text. */
export function patchCardImage(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/thumb.webp`;
}

function sectionOf(entry: PatchNotesEntry): string | undefined {
  if (entry.mode === 'battlegrounds') return BATTLEGROUNDS_SECTION.id;
  if (entry.mode === 'arena') return ARENA_SECTION.id;
  return entry.cardClass && CLASS_LABELS[entry.cardClass] ? entry.cardClass : undefined;
}

function subtitleOf(entry: PatchNotesEntry): string | undefined {
  if (entry.subtitle) return entry.subtitle;
  if (entry.mode === 'battlegrounds') return 'Поля сражений';
  const label = entry.cardClass ? CLASS_LABELS[entry.cardClass] : undefined;
  if (entry.mode === 'arena') return label ? `Арена · ${label}` : 'Арена';
  return label;
}

/**
 * The patch as Varylo PatchNotes reads it. Constructed cards are grouped by
 * class (the class filter); Arena and Battlegrounds keep one section each.
 * Entries of cards the server could not match stay under "Другие изменения".
 */
export function toPatchNotesView(detail: Pick<PatchNotesDetail, 'entries'>): { entries: PatchEntry[]; sections: PatchSection[] } {
  const entries = detail.entries.map((entry): PatchEntry => ({
    id: entry.id,
    name: entry.name,
    ...(entry.cardId ? { image: patchCardImage(entry.cardId) } : {}),
    subtitle: subtitleOf(entry),
    section: sectionOf(entry),
    changes: entry.changes.map(change => ({
      label: change.label,
      ...(change.before !== undefined ? { before: change.before } : {}),
      ...(change.after !== undefined ? { after: change.after } : {}),
      ...(change.better ? { better: change.better } : {}),
    })),
    ...(entry.note ? { note: entry.note } : {}),
    // Without a stated old value the article does not say the card is new.
    ...(entry.changes.every(change => change.before === undefined) ? { kind: 'rework' as const } : {}),
  }));
  const used = new Set(entries.map(entry => entry.section).filter(Boolean));
  const sections: PatchSection[] = [
    ...CLASS_ORDER.filter(id => used.has(id)).map(id => ({ id, title: CLASS_LABELS[id] })),
    ...[ARENA_SECTION, BATTLEGROUNDS_SECTION].filter(section => used.has(section.id)),
  ];
  return { entries, sections };
}

/** `/standard/patches/` for the newest patch, else the archive address of one version. */
export function patchNotesHref(version: string | null): string {
  return version ? `/standard/patches/?version=${encodeURIComponent(version)}` : '/standard/patches/';
}
