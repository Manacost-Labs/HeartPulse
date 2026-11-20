import { INDEXABLE_ARCHETYPE_MIN_GAMES, isIndexableArchetype } from '@/shared/constructedArchetypeIndexing';
import { INDEX_MIN_OWN_FACTS, meetsContentThreshold } from '@/shared/seoIndexThreshold';
import type { StandardMetaClass } from '@/shared/standardMetaContract';
import type { ArchetypeCatalog } from '@/src/features/ConstructedArchetypes';
import { renderSeoDataTemplate } from '@/src/seo/dataTemplate';
import { META_DESCRIPTION_MAX, META_TITLE_MAX } from '@/src/shared/seo/metaDescription';
import { pluralRu } from '@/src/shared/text/pluralRu';
import { seoDataDate, seoDateValues } from './seoDataDate';

// The deck pages of Standard (#309): the hub `/standard/decks/` and one page per class. Pure rules, shared by the
// pages, their metadata and the tests; the reads are in `publicClassDecks.ts`.

/** The eleven classes in the catalog's keys, with the class's name and its genitive («Колоды Паладина»). */
export const DECK_CLASSES: readonly { key: StandardMetaClass; name: string; genitive: string }[] = [
  { key: 'deathknight', name: 'Рыцарь смерти', genitive: 'Рыцаря смерти' },
  { key: 'demonhunter', name: 'Охотник на демонов', genitive: 'Охотника на демонов' },
  { key: 'druid', name: 'Друид', genitive: 'Друида' },
  { key: 'hunter', name: 'Охотник', genitive: 'Охотника' },
  { key: 'mage', name: 'Маг', genitive: 'Мага' },
  { key: 'paladin', name: 'Паладин', genitive: 'Паладина' },
  { key: 'priest', name: 'Жрец', genitive: 'Жреца' },
  { key: 'rogue', name: 'Разбойник', genitive: 'Разбойника' },
  { key: 'shaman', name: 'Шаман', genitive: 'Шамана' },
  { key: 'warlock', name: 'Чернокнижник', genitive: 'Чернокнижника' },
  { key: 'warrior', name: 'Воин', genitive: 'Воина' },
];

export type DeckClass = (typeof DECK_CLASSES)[number];
export type DeckArchetype = ArchetypeCatalog['items'][number];

/**
 * A class page lists at most this many archetypes: each row reads its archetype's build, so the page asks Express
 * for no more details than this. The live catalog has at most nine strong archetypes in a class.
 */
export const CLASS_DECKS_MAX_ARCHETYPES = 12;

/** Numbers a row of a class page states (winrate, popularity, games): the facts of the content threshold. */
const FACTS_PER_ARCHETYPE = 3;
/** Rows a class page needs to state `INDEX_MIN_OWN_FACTS` facts. */
export const CLASS_DECKS_MIN_ARCHETYPES = Math.ceil(INDEX_MIN_OWN_FACTS / FACTS_PER_ARCHETYPE);
/** «от 1 000 игр»: the sample threshold of the archetypes the deck pages list. */
export const MIN_GAMES_TEXT = `от ${INDEXABLE_ARCHETYPE_MIN_GAMES.toLocaleString('ru-RU')} игр`;

export const deckClass = (key: string): DeckClass | null => DECK_CLASSES.find(entry => entry.key === key) ?? null;
export const classDecksPath = (key: string) => `/standard/decks/${key}/`;
export const archetypePath = (slug: string) => `/standard/archetypes/standard/${slug}/`;

/**
 * The archetypes of a class that pass the indexing rule (`isIndexableArchetype`, the same rule as their own pages),
 * best winrate first, the larger sample breaking ties; at most `CLASS_DECKS_MAX_ARCHETYPES`.
 */
export function classArchetypes(catalog: ArchetypeCatalog, key: string): DeckArchetype[] {
  return catalog.items
    .filter(item => item.format === 'standard' && item.classKey === key && isIndexableArchetype(item))
    .sort((left, right) => (right.winrate ?? -1) - (left.winrate ?? -1) || right.games - left.games)
    .slice(0, CLASS_DECKS_MAX_ARCHETYPES);
}

/** The best archetype of each class for the hub: the top row of its class page. */
export const hubArchetypes = (catalog: ArchetypeCatalog) =>
  DECK_CLASSES.map(entry => ({ entry, best: classArchetypes(catalog, entry.key)[0] ?? null }));

/** The sample a page states under its H1: the archetypes it lists and their games («9 архетипов, 120 000 игр»). */
export function sampleText(rows: readonly DeckArchetype[]): string {
  const games = rows.reduce((sum, row) => sum + row.games, 0);
  return `${rows.length} ${pluralRu(rows.length, 'архетип', 'архетипа', 'архетипов')}, ${games.toLocaleString('ru-RU')} ${pluralRu(games, 'игра', 'игры', 'игр')}`;
}

/** Whether a class page states enough facts to be offered to search engines (`seoIndexThreshold.ts`). */
export const classDecksIndexable = (rows: readonly DeckArchetype[]) =>
  meetsContentThreshold({ ownWords: 0, ownFacts: rows.length * FACTS_PER_ARCHETYPE });

const percent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

/**
 * Title and description of a class page. The month is the month of the data and is the first to go when the title
 * is longer than `META_TITLE_MAX` (the longest class names); stale data has none.
 */
export function classDecksSeoText(entry: DeckClass, catalog: ArchetypeCatalog | null, now: number) {
  const rows = catalog ? classArchetypes(catalog, entry.key) : [];
  const date = catalog && seoDataDate(catalog.updatedAt, now);
  const leader = rows[0];
  const values = {
    cls: entry.genitive, month: date ? seoDateValues(date).month : null, asOf: date ? seoDateValues(date).asOf : null,
    archetypes: rows.length ? `${rows.length} ${pluralRu(rows.length, 'архетип', 'архетипа', 'архетипов')}` : null,
    leader: leader && leader.winrate !== null ? `${leader.archetypeLabel}, ${percent(leader.winrate)} побед` : null,
  };
  return {
    title: renderSeoDataTemplate('Колоды {cls} Hearthstone (хс): топ[, {month}]', values, META_TITLE_MAX)
      ?? `Колоды ${entry.genitive} Hearthstone (хс)`,
    description: renderSeoDataTemplate('Колоды {cls} в Hearthstone (хс)[{asOf}][: {archetypes}][, лидер — {leader}]. '
      + 'Коды колод и составы, Стандарт. Данные HSGuru.', values, META_DESCRIPTION_MAX)
      ?? `Колоды ${entry.genitive} в Hearthstone (хс): коды колод и составы, Стандарт. Данные HSGuru.`,
  };
}
