import { publicResourceImageUrl } from '../publicResourceUrl';

export type MulliganSortKey =
  | 'hsreplay_rank'
  | 'keep_percentage'
  | 'opening_hand_winrate'
  | 'winrate_when_drawn'
  | 'winrate_when_played'
  | 'avg_turn_played_on'
  | 'times_presented_in_initial_cards'
  | 'times_card_played';

export type MulliganSort = {
  key: MulliganSortKey;
  direction: 'asc' | 'desc';
};

type SortableMulliganRow = {
  dbf_id: number;
} & Partial<Record<MulliganSortKey, number | null>>;

function sortableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function sortMulliganRows<T extends SortableMulliganRow>(
  rows: readonly T[],
  sort: MulliganSort,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: sortableNumber(row[sort.key]) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) return left.index - right.index;
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      const difference = left.value - right.value;
      if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
      return left.index - right.index;
    })
    .map(item => item.row);
}

export type HsguruCardStatSortKey =
  | 'mulliganImpact'
  | 'mulliganCount'
  | 'drawnImpact'
  | 'drawnCount'
  | 'keptImpact'
  | 'keptCount';

export type HsguruCardStatSort = {
  key: HsguruCardStatSortKey;
  direction: 'asc' | 'desc';
};

type SortableHsguruCardStat = {
  cardName: string;
} & Partial<Record<HsguruCardStatSortKey, number | null>>;

export function sortHsguruCardStats<T extends SortableHsguruCardStat>(
  rows: readonly T[],
  sort: HsguruCardStatSort,
): T[] {
  return rows
    .map((row, index) => ({ row, index, value: sortableNumber(row[sort.key]) }))
    .sort((left, right) => {
      if (left.value === null && right.value === null) {
        return left.row.cardName.localeCompare(right.row.cardName, 'ru') || left.index - right.index;
      }
      if (left.value === null) return 1;
      if (right.value === null) return -1;
      const difference = left.value - right.value;
      if (difference !== 0) return sort.direction === 'asc' ? difference : -difference;
      return left.row.cardName.localeCompare(right.row.cardName, 'ru') || left.index - right.index;
    })
    .map(item => item.row);
}

/** HSGuru impacts measured on fewer games than this swing by several points from noise alone. */
export const LOW_CARD_SAMPLE = 100;

export function isLowCardSample(count: number | null | undefined): boolean {
  return count === null || count === undefined || !Number.isFinite(count) || count < LOW_CARD_SAMPLE;
}

export type HsguruCardStatImpactKey = Extract<HsguruCardStatSortKey, `${string}Impact`>;

/** One bar scale per phase; the 2-point floor keeps near-zero phases from drawing full-width bars. */
export function cardStatImpactScale(
  rows: readonly Partial<Record<HsguruCardStatImpactKey, number | null>>[],
  key: HsguruCardStatImpactKey,
): number {
  return rows.reduce((scale, row) => {
    const value = sortableNumber(row[key]);
    return value === null ? scale : Math.max(scale, Math.abs(value));
  }, 2);
}

/** A new column starts with the largest values; the active one flips. There is no unsorted state. */
export function nextCardStatSort(current: HsguruCardStatSort, key: HsguruCardStatSortKey): HsguruCardStatSort {
  return current.key === key
    ? { key, direction: current.direction === 'desc' ? 'asc' : 'desc' }
    : { key, direction: 'desc' };
}

const CSV_COLUMNS: Array<[HsguruCardStatSortKey, string]> = [
  ['mulliganImpact', 'Влияние в муллигане'],
  ['mulliganCount', 'Количество муллиганов'],
  ['drawnImpact', 'Влияние при доборе'],
  ['drawnCount', 'Количество доборов'],
  ['keptImpact', 'Влияние при оставлении'],
  ['keptCount', 'Количество оставлений'],
];

function signedPercent(value: number | null): string {
  if (value === null) return '—';
  return `${value > 0 ? '+' : ''}${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

/** The export keeps one column per metric, although the table pairs impact and sample in one cell. */
export function cardStatsCsvRows(rows: readonly SortableHsguruCardStat[]): { header: string[]; rows: string[][] } {
  return {
    header: ['Карта', ...CSV_COLUMNS.map(([, label]) => label)],
    rows: rows.map(row => [row.cardName, ...CSV_COLUMNS.map(([key]) => {
      const value = sortableNumber(row[key]);
      if (key.endsWith('Impact')) return signedPercent(value);
      return value === null ? '—' : String(Math.round(value));
    })]),
  };
}

type HeroArtCard = {
  cardId: string | null;
  mulliganCount: number;
  fullArtwork?: string | null;
};

export type ArchetypeHeroArt = { src: string };

type ArchetypeClassKey =
  | 'deathknight' | 'demonhunter' | 'druid' | 'hunter' | 'mage' | 'paladin'
  | 'priest' | 'rogue' | 'shaman' | 'warlock' | 'warrior';

/**
 * Full-bleed header art per class: wiki full artwork of one class card, cropped to 2.4:1
 * and stored in public/archetype-art/classes at 960 and 1920 px (sources in assets.md).
 * `focus` keeps the illustration's subject in view where the left gradient leaves it visible.
 */
const CLASS_BACKDROP_FOCUS: Record<ArchetypeClassKey, string> = {
  deathknight: '55% 40%',
  demonhunter: '62% 30%',
  druid: '40% 30%',
  hunter: '70% 45%',
  mage: '60% 50%',
  paladin: '50% 40%',
  priest: '62% 35%',
  rogue: '50% 35%',
  shaman: '50% 40%',
  warlock: '55% 40%',
  warrior: '50% 45%',
};

export type ArchetypeClassBackdrop = { src: string; srcSet: string; focus: string };

export function archetypeClassBackdrop(classKey: string | null): ArchetypeClassBackdrop | null {
  if (!classKey || !(classKey in CLASS_BACKDROP_FOCUS)) return null;
  const base = `/archetype-art/classes/${classKey}`;
  return {
    src: `${base}-1920.webp`,
    srcSet: `${base}-960.webp 960w, ${base}-1920.webp 1920w`,
    focus: CLASS_BACKDROP_FOCUS[classKey as ArchetypeClassKey],
  };
}

const ARCHETYPE_HERO_ART_OVERRIDES: Record<string, string> = {
  'void-soul-dh': '/archetype-art/void-soul-dh.webp',
};
/**
 * The image proxy serves at most 512 px, which is also the size of a HearthstoneJSON original.
 * Originals are padded with white to a square, so the proxy trims that padding.
 */
const HERO_ART_WIDTH = 512;

function heroArtUrl(source: string): string {
  const url = publicResourceImageUrl(source, { width: HERO_ART_WIDTH });
  return url.startsWith('/api/public-resource/') ? `${url}&trim=1` : url;
}

/**
 * Picks the dossier art from the most mulliganed cards: a wiki full artwork among the five most
 * mulliganed when one exists, otherwise the most mulliganed card's original art. The 320x64
 * horizontal tile art is never stretched into the hero.
 */
export function archetypeHeroArt(slug: string, cards: readonly HeroArtCard[]): ArchetypeHeroArt | null {
  const override = ARCHETYPE_HERO_ART_OVERRIDES[slug];
  if (override) return { src: override };
  const candidates = cards.filter(card => card.cardId)
    .sort((left, right) => right.mulliganCount - left.mulliganCount)
    .slice(0, 5);
  const withFullArt = candidates.find(card => card.fullArtwork);
  if (withFullArt?.fullArtwork) return { src: heroArtUrl(withFullArt.fullArtwork) };
  const cardId = candidates[0]?.cardId;
  return cardId ? { src: heroArtUrl(`/api/public-resource/hsjson/v1/orig/${encodeURIComponent(cardId)}.png`) } : null;
}

export function hsguruImpactTone(value: number | null): 'positive' | 'neutral' | 'negative' | 'unknown' {
  if (value === null || !Number.isFinite(value)) return 'unknown';
  if (value > 0.25) return 'positive';
  if (value < -0.25) return 'negative';
  return 'neutral';
}

export function hsguruMatchupTone(winrate: number | null): 'favored' | 'even' | 'unfavored' | 'unknown' {
  if (winrate === null || !Number.isFinite(winrate)) return 'unknown';
  if (winrate >= 52) return 'favored';
  if (winrate >= 48) return 'even';
  return 'unfavored';
}

export type HsguruAnalysisState = 'ok' | 'partial' | 'error';
export type HsguruAnalysisSection = 'matchups' | 'cards';

export function hsguruAnalysisEmptyMessage(
  state: HsguruAnalysisState | null,
  section: HsguruAnalysisSection,
): string {
  const subject = section === 'matchups' ? 'матчапов' : 'статистики карт';
  if (state === 'error') {
    return `Последнее обновление завершилось ошибкой. Мы уже повторяем сбор ${subject}.`;
  }
  if (state === 'partial') {
    return section === 'matchups'
      ? 'HSGuru не вернул матчапы в последнем срезе. Данные появятся, когда у архетипа будет достаточная выборка.'
      : 'HSGuru не вернул статистику карт в последнем срезе. Данные появятся, когда у архетипа будет достаточная выборка.';
  }
  return section === 'matchups'
    ? 'Матчапы ещё не получены.'
    : 'Статистика карт ещё не получена.';
}
