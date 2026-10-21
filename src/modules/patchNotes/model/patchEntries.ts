import type { PatchNotesChange, PatchNotesDetail, PatchNotesEntry, PatchNotesMode } from './types';

/** Which way one change moved for the player; `neutral` when the source gives no direction. */
export type PatchDirection = 'buff' | 'nerf' | 'neutral';
/** The verdict on a whole card: every directed change agrees, else "Изменение". */
export type PatchKind = 'buff' | 'nerf' | 'rework';
/** How the thumbnail is shaped: a Constructed card render, square Battlegrounds art or a hero portrait. */
export type PatchCardArt = 'card' | 'square' | 'hero';

export type PatchChangeView = PatchNotesChange & { direction: PatchDirection };

/** Page sections: Constructed splits by today's format; `constructed` holds cards of unknown format. */
export type PatchSectionId = 'standard' | 'wild' | 'constructed' | 'arena' | 'battlegrounds' | 'other';

export type PatchCardView = {
  id: string;
  name: string;
  sourceName: string | null;
  mode: PatchNotesMode;
  section: PatchSectionId;
  group: string;
  /** "Существо · Воин", "Малый аксессуар", "Дуэли · Уиллоу". */
  typeLabel: string | null;
  cardId: string | null;
  thumb: string | null;
  /** Catalog render for the hover preview; the page falls back to the HearthstoneJSON render. */
  renderUrl: string | null;
  art: PatchCardArt;
  /** The card's page on the site (statistics and decks with it), for Constructed cards of a known format. */
  cardUrl: string | null;
  kind: PatchKind;
  changes: PatchChangeView[];
  note: string | null;
  /** A rule-text diff needs the full row width. */
  hasText: boolean;
  search: string;
};

export type PatchGroupView = { id: string; section: PatchSectionId; title: string; entries: PatchCardView[] };
export type PatchKindCounts = Record<PatchKind, number>;
export type PatchSectionView = { id: PatchSectionId; mode: PatchNotesMode; title: string; count: number; kinds: PatchKindCounts };
export type PatchView = { sections: PatchSectionView[]; groups: PatchGroupView[]; kinds: PatchKindCounts; total: number };
export type PatchFilter = { section: PatchSectionId | 'all'; kind: PatchKind | 'all'; group: string; query: string };

export const PATCH_SECTION_TITLES: Record<PatchSectionId, string> = {
  standard: 'Стандарт',
  wild: 'Вольный',
  constructed: 'Стандарт и Вольный',
  arena: 'Арена',
  battlegrounds: 'Поля сражений',
  other: 'Другие режимы',
};
const SECTION_ORDER: PatchSectionId[] = ['standard', 'wild', 'constructed', 'arena', 'battlegrounds', 'other'];
const SECTION_MODE: Record<PatchSectionId, PatchNotesMode> = {
  standard: 'constructed', wild: 'constructed', constructed: 'constructed', arena: 'arena', battlegrounds: 'battlegrounds', other: 'other',
};

function sectionOf(entry: PatchNotesEntry): PatchSectionId {
  if (entry.mode !== 'constructed') return entry.mode;
  return entry.format ?? 'constructed';
}

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

const CONSTRUCTED_TYPES: Record<string, string> = {
  minion: 'Существо', spell: 'Заклинание', weapon: 'Оружие', hero: 'Герой', location: 'Место',
};
/** Battlegrounds groups by catalog type; the article's own list headings ("Малый аксессуар") come first. */
const BATTLEGROUND_TYPES: Record<string, { group: string; label: string }> = {
  minion: { group: 'Существа', label: 'Существо' },
  spell: { group: 'Заклинания таверны', label: 'Заклинание таверны' },
  hero: { group: 'Герои', label: 'Герой' },
  trinket: { group: 'Аксессуары', label: 'Аксессуар' },
  'dark-gift': { group: 'Тёмные дары', label: 'Тёмный дар' },
  anomaly: { group: 'Аномалии', label: 'Аномалия' },
  quest: { group: 'Задания', label: 'Задание' },
  reward: { group: 'Награды за задания', label: 'Награда за задание' },
  'darkmoon-prize': { group: 'Призы ярмарки', label: 'Приз ярмарки' },
};
const BATTLEGROUND_GROUP_ORDER = ['Существа', 'Заклинания таверны', 'Герои', 'Броня героя', 'Малый аксессуар',
  'Большой аксессуар', 'Аксессуары', 'Тёмные дары', 'Аномалии', 'Задания', 'Награды за задания', 'Призы ярмарки'];
const OTHER_CARDS = 'Прочие изменения';

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Direction comes only from numbers the server marked with the better side: lower cost, higher stats. */
export function changeDirection(change: PatchNotesChange): PatchDirection {
  if (!change.better || !isNumber(change.before) || !isNumber(change.after) || change.before === change.after) return 'neutral';
  return (change.after > change.before) === (change.better === 'higher') ? 'buff' : 'nerf';
}

export function patchKind(changes: readonly PatchNotesChange[]): PatchKind {
  const directions = new Set(changes.map(changeDirection).filter(direction => direction !== 'neutral'));
  return directions.size === 1 ? [...directions][0] as PatchKind : 'rework';
}

/** Card picture through the site's card-image proxy: a card render, or square art for Battlegrounds. */
export function patchCardImage(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/thumb.webp`;
}

function placement(entry: PatchNotesEntry): { group: string; groupTitle: string; typeLabel: string | null } {
  const section = sectionOf(entry);
  if (entry.mode === 'battlegrounds') {
    const type = entry.cardType ? BATTLEGROUND_TYPES[entry.cardType] : undefined;
    const title = entry.subtitle ?? type?.group ?? OTHER_CARDS;
    return { group: `battlegrounds:${title}`, groupTitle: title, typeLabel: entry.subtitle ?? type?.label ?? null };
  }
  if (entry.mode === 'other') {
    const title = entry.subtitle?.split(' · ')[0] || OTHER_CARDS;
    return { group: `other:${title}`, groupTitle: title, typeLabel: entry.subtitle };
  }
  const classLabel = entry.cardClass ? CLASS_LABELS[entry.cardClass] : undefined;
  const typeLabel = [entry.cardType ? CONSTRUCTED_TYPES[entry.cardType] : undefined, classLabel].filter(Boolean).join(' · ');
  return {
    group: `${section}:${classLabel ? entry.cardClass : 'unknown'}`,
    groupTitle: classLabel ?? 'Карты не из коллекции',
    typeLabel: [typeLabel, entry.subtitle].filter(Boolean).join(' · ') || null,
  };
}

function art(entry: PatchNotesEntry): PatchCardArt {
  if (entry.mode !== 'battlegrounds') return 'card';
  return entry.cardType === 'hero' ? 'hero' : 'square';
}

function groupRank(group: PatchGroupView): number {
  const key = group.id.slice(group.id.indexOf(':') + 1);
  const order = group.section === 'battlegrounds' ? BATTLEGROUND_GROUP_ORDER : CLASS_ORDER;
  const index = order.indexOf(group.section === 'battlegrounds' ? group.title : key);
  return index === -1 ? order.length : index;
}

const emptyKinds = (): PatchKindCounts => ({ buff: 0, nerf: 0, rework: 0 });

/**
 * The patch as the page shows it: sections by game mode, groups by class
 * (Constructed, Arena) or card type (Battlegrounds), and kind counts for the
 * header and filters. Group order is fixed; unknown groups keep article order.
 */
export function toPatchView(detail: Pick<PatchNotesDetail, 'entries'>): PatchView {
  const groups = new Map<string, PatchGroupView>();
  const kinds = emptyKinds();
  const sections = new Map<PatchSectionId, PatchSectionView>();
  for (const entry of detail.entries) {
    const { group, groupTitle, typeLabel } = placement(entry);
    const changes = entry.changes.map(change => ({ ...change, direction: changeDirection(change) }));
    const sectionId = sectionOf(entry);
    const card: PatchCardView = {
      id: entry.id,
      name: entry.name,
      sourceName: entry.sourceName ?? null,
      mode: entry.mode,
      section: sectionId,
      group,
      typeLabel,
      cardId: entry.cardId,
      thumb: entry.cardId ? patchCardImage(entry.cardId) : null,
      renderUrl: entry.renderUrl ?? null,
      art: art(entry),
      cardUrl: entry.cardId && entry.format ? `/standard/cards/${entry.format}/${encodeURIComponent(entry.cardId)}/` : null,
      kind: patchKind(entry.changes),
      changes,
      note: entry.note,
      hasText: changes.some(change => typeof change.before === 'string' && change.before.length > 12
        || typeof change.after === 'string' && change.after.length > 12),
      search: [entry.name, entry.sourceName, typeLabel, ...entry.changes.flatMap(change => [change.label, change.before, change.after])]
        .filter(value => value !== undefined && value !== null).join(' ').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е'),
    };
    const known = groups.get(group) ?? { id: group, section: sectionId, title: groupTitle, entries: [] };
    known.entries.push(card);
    groups.set(group, known);
    kinds[card.kind] += 1;
    const section = sections.get(sectionId)
      ?? { id: sectionId, mode: SECTION_MODE[sectionId], title: PATCH_SECTION_TITLES[sectionId], count: 0, kinds: emptyKinds() };
    section.count += 1;
    section.kinds[card.kind] += 1;
    sections.set(sectionId, section);
  }
  const ordered = [...groups.values()].map((group, index) => ({ group, index })).sort((left, right) =>
    SECTION_ORDER.indexOf(left.group.section) - SECTION_ORDER.indexOf(right.group.section)
    || groupRank(left.group) - groupRank(right.group) || left.index - right.index).map(({ group }) => group);
  return {
    sections: SECTION_ORDER.flatMap(id => sections.get(id) ?? []),
    groups: ordered,
    kinds,
    total: detail.entries.length,
  };
}

/** `/standard/patches/` for the newest patch, else the archive address of one version. */
export function patchNotesHref(version: string | null): string {
  return version ? `/standard/patches/?version=${encodeURIComponent(version)}` : '/standard/patches/';
}

/** "ИЗМЕНЕНИЯ СУЩЕСТВ" as a sentence: "Изменения существ". */
export function sentenceCase(value: string): string {
  if (value !== value.toLocaleUpperCase('ru-RU')) return value;
  const lower = value.toLocaleLowerCase('ru-RU');
  return lower.charAt(0).toLocaleUpperCase('ru-RU') + lower.slice(1);
}
