import { Router, type Request, type RequestHandler, type Response } from 'express';
import { decode } from '@firestone-hs/deckstrings';
import { isPublicConstructedTerm } from '../shared/constructedCardTranslations.js';
import {
  ConstructedCardCatalogCandidateError,
  ConstructedCardCatalogStore,
  type ConstructedCardCatalogDocument,
} from './constructedCardCatalogStore.js';
import {
  ConstructedCardHistoryStore,
  type ConstructedCardHistoryPoint,
} from './constructedCardHistoryStore.js';

export type ConstructedCardFormat = 'standard' | 'wild';
export type ConstructedCardPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';
export type ConstructedCardRank = 'legend' | 'diamond_4_1' | 'diamond' | 'platinum';

export type ConstructedCardPeriodDescriptor = {
  id: ConstructedCardPeriod;
  label: string;
  timeRange: string | null;
  patch: string | null;
};

export type ConstructedCardRankDescriptor = {
  id: ConstructedCardRank;
  label: string;
  rankRange: string;
};

type JsonRecord = Record<string, any>;

export type ConstructedCardCollection = {
  cards: JsonRecord[];
  updatedAt: string | null;
  sourceUrl: string;
  warning?: string | null;
  cacheSource: 'fresh' | 'LKG';
  dataStatus: 'fresh' | 'stale';
  partial: false;
  datasetVersion: string;
  catalogVerifiedAt: string;
  catalogPublishedAt: string;
  period?: ConstructedCardPeriodDescriptor;
  rank?: ConstructedCardRankDescriptor;
};

export type ConstructedCardDetailResult = {
  card: JsonRecord;
  cacheSource: 'fresh' | 'LKG';
  dataStatus: 'fresh' | 'stale';
  partial: boolean;
  warning: string | null;
  datasetVersion: string;
  period?: ConstructedCardPeriodDescriptor;
  rank?: ConstructedCardRankDescriptor;
};

export type ConstructedCardCatalogHealth = {
  format: ConstructedCardFormat;
  state: 'fresh' | 'stale' | 'expired' | 'missing';
  dataStatus: 'fresh' | 'stale' | 'unavailable';
  cacheSource: 'fresh' | 'LKG' | null;
  verifiedAt: string | null;
  publishedAt: string | null;
  records: number;
  datasetVersion: string | null;
  warning: string | null;
};

export type ConstructedCardDataService = {
  loadCards: (
    format: ConstructedCardFormat,
    period?: ConstructedCardPeriod,
    rank?: ConstructedCardRank,
  ) => Promise<ConstructedCardCollection>;
  loadCardDetail: (
    format: ConstructedCardFormat,
    cardId: string,
    period?: ConstructedCardPeriod,
    statsFormat?: ConstructedCardFormat,
    rank?: ConstructedCardRank,
  ) => Promise<ConstructedCardDetailResult | null>;
  loadCardHistory: (
    format: ConstructedCardFormat,
    cardId: string,
    period?: ConstructedCardPeriod,
    rank?: ConstructedCardRank,
    days?: number,
  ) => Promise<ConstructedCardHistoryPoint[]>;
  getCatalogHealth: (format: ConstructedCardFormat) => ConstructedCardCatalogHealth;
  invalidate?: () => void;
};

export type ConstructedCardDeck = {
  id: string;
  title: string;
  archetype: string | null;
  archetypeLabel: string;
  className: string | null;
  deckCode: string;
  source: string | null;
  sourceUrl: string | null;
  winrate: number | null;
  score: string | null;
  updatedAt: string | null;
};

type ConstructedCardDeckPreview = {
  hash: string;
  state: string;
  ready: boolean;
  imageUrl: string | null;
  error: string | null;
};

export type ConstructedCardRouterDependencies = ConstructedCardDataService & {
  adminGuard: RequestHandler;
  canAccessStats?: (request: Request) => boolean | Promise<boolean>;
  setPrivateNoStore: (response: Response) => void;
  getMechanicTranslations?: () => Record<string, string>;
  getMechanicTranslationOverrides?: () => Record<string, string>;
  createDeckPreview?: (deck: ConstructedCardDeck) => Promise<ConstructedCardDeckPreview>;
  onError?: (scope: 'list' | 'detail' | 'history' | 'deck-preview', error: unknown) => void;
};

type DataServiceDependencies = {
  fetchJson: (url: string) => Promise<any>;
  catalogBaseUrl: string;
  statsDatasetByFormat: Record<
    ConstructedCardFormat,
    string
    | Partial<Record<ConstructedCardPeriod, string>>
    | Partial<Record<
      ConstructedCardRank,
      string | Partial<Record<ConstructedCardPeriod, string>>
    >>
  >;
  statsBaseUrl: string;
  patchesUrl?: string;
  constructedDecksUrl?: string;
  getArchetypeTranslations?: () => Promise<Record<string, string>>;
  stateDirectory?: string;
  now?: () => number;
  maxCatalogStaleMs?: number;
  minimumCatalogCardsByFormat?: Partial<Record<ConstructedCardFormat, number>>;
  controlledCatalogExpansionByFormat?: Partial<Record<ConstructedCardFormat, boolean>>;
  catalogStore?: ConstructedCardCatalogStore;
  historyStore?: ConstructedCardHistoryStore;
  onHistoryError?: (error: unknown) => void;
  negativeDetailCacheMaxEntries?: number;
  cacheTtlMs?: number;
};

export class ConstructedCardUpstreamError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardUpstreamError';
    this.status = Number.isInteger(status) ? status : null;
  }
}

export class ConstructedCardCatalogUnavailableError extends Error {
  readonly retryAfterSeconds = 60;

  constructor(message = 'Constructed card catalog is unavailable', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardCatalogUnavailableError';
  }
}

export class ConstructedCardDetailUnavailableError extends Error {
  readonly retryAfterSeconds = 60;

  constructor(message = 'Constructed card detail could not be authoritatively resolved', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConstructedCardDetailUnavailableError';
  }
}

const FORMATS = new Set<ConstructedCardFormat>(['standard', 'wild']);
const PERIODS = new Set<ConstructedCardPeriod>(['1d', '3d', '7d', '14d', 'patch']);
const RANKS = new Set<ConstructedCardRank>(['legend', 'diamond_4_1', 'diamond', 'platinum']);
const PERIOD_LABELS: Record<ConstructedCardPeriod, string> = {
  '1d': 'Последний день',
  '3d': 'Последние 3 дня',
  '7d': 'Последние 7 дней',
  '14d': 'Последние 14 дней',
  patch: 'Текущий патч',
};
const PERIOD_TIME_RANGES: Record<ConstructedCardPeriod, string | null> = {
  '1d': 'LAST_1_DAY',
  '3d': 'LAST_3_DAYS',
  '7d': 'LAST_7_DAYS',
  '14d': 'LAST_14_DAYS',
  patch: null,
};
const RANK_LABELS: Record<ConstructedCardRank, string> = {
  legend: 'Легенда',
  diamond_4_1: 'Алмаз 1–4',
  diamond: 'Алмаз',
  platinum: 'Платина',
};
const RANK_RANGES: Record<ConstructedCardRank, string> = {
  legend: 'LEGEND',
  diamond_4_1: 'DIAMOND_FOUR_THROUGH_DIAMOND_ONE',
  diamond: 'DIAMOND',
  platinum: 'PLATINUM',
};
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 120;
// One-day card slices contain a long tail with only a handful of observations.
// Showing percentages for those rows produces technically valid but misleading
// 75–100% leaders. Keep the sample count visible, but only publish rate metrics
// once the card has enough observed plays to make comparisons useful.
export const MIN_RELIABLE_CONSTRUCTED_CARD_GAMES = 100;
const SORTS = new Set(['popularity', 'winrate', 'games', 'mana', 'attack', 'health', 'name', 'set', 'class', 'mechanics']);
const STATISTIC_SORTS = new Set(['popularity', 'winrate', 'games']);
const CONSTRUCTED_SET_RELEASE_ORDER = [
  'ESCAPEFROM_VIOLET_HOLD', 'CATACLYSM', 'TIME_TRAVEL', 'THE_LOST_CITY', 'EMERALD_DREAM',
  'SPACE', 'ISLAND_VACATION', 'WHIZBANGS_WORKSHOP', 'WILD_WEST', 'WONDERS', 'TITANS',
  'BATTLE_OF_THE_BANDS', 'RETURN_OF_THE_LICH_KING', 'PATH_OF_ARTHAS', 'REVENDRETH',
  'THE_SUNKEN_CITY', 'ALTERAC_VALLEY', 'STORMWIND', 'THE_BARRENS', 'DARKMOON_FAIRE',
  'SCHOLOMANCE', 'BLACK_TEMPLE', 'YEAR_OF_THE_DRAGON', 'DRAGONS', 'ULDUM', 'DALARAN',
  'TROLL', 'BOOMSDAY', 'GILNEAS', 'LOOTAPALOOZA', 'ICECROWN', 'UNGORO', 'GANGS',
  'KARA', 'OG', 'LOE', 'TGT', 'BRM', 'GVG', 'NAXX', 'DEMON_HUNTER_INITIATE',
  'EXPERT1', 'CORE', 'LEGACY', 'EVENT',
] as const;
const CONSTRUCTED_SET_RELEASE_INDEX = new Map<string, number>(
  CONSTRUCTED_SET_RELEASE_ORDER.map((set, index) => [set, index]),
);
const VALID_CLASSES = new Set([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL', 'DREAM',
]);
const CONSTRUCTED_ARCHETYPE_FALLBACK_RU: Record<string, string> = {
  'elwynn boar warlock': 'Чернокнижник на Эльвинских вепрях',
  'hand warlock': 'Хендлок',
  'herald egg warlock': 'Кхелос Чернокнижник',
  'insanity warlock': 'Инсанити Чернокнижник',
  'pain warlock': 'Пейнлок',
  'rafaam warlock': 'Рафаам Чернокнижник',
  'renathal big warlock': 'Ренатал Биг Чернокнижник',
  'renathal reno tick tock egg warlock': 'Ренатал Рено Тик-Ток Кхелос Чернокнижник',
  'renathal reno tick tock warlock': 'Ренатал Рено Тик-Ток Чернокнижник',
  'renathal tick tock warlock': 'Ренатал Тик-Ток Чернокнижник',
  'seed warlock': 'Квестлайн Чернокнижник',
};

function readFormat(value: unknown): ConstructedCardFormat | null {
  const format = String(value ?? 'standard') as ConstructedCardFormat;
  return FORMATS.has(format) ? format : null;
}

function readPeriod(value: unknown): ConstructedCardPeriod | null {
  const period = String(value ?? '1d') as ConstructedCardPeriod;
  return PERIODS.has(period) ? period : null;
}

function readRank(value: unknown): ConstructedCardRank | null {
  const rank = String(value ?? 'legend') as ConstructedCardRank;
  return RANKS.has(rank) ? rank : null;
}

function statsDatasetFor(
  dependencies: DataServiceDependencies,
  format: ConstructedCardFormat,
  period: ConstructedCardPeriod,
  rank: ConstructedCardRank,
): string {
  const configured = dependencies.statsDatasetByFormat[format];
  if (typeof configured === 'string') {
    if (rank === 'legend') return configured;
    throw new ConstructedCardUpstreamError(`Constructed card rank ${rank} is not configured`);
  }
  const ranked = configured as Partial<Record<
    ConstructedCardRank,
    string | Partial<Record<ConstructedCardPeriod, string>>
  >>;
  const rankConfigured = ranked[rank];
  const selected = rankConfigured ?? (rank === 'legend'
    ? configured as Partial<Record<ConstructedCardPeriod, string>>
    : undefined);
  if (typeof selected === 'string') return selected;
  const dataset = selected?.[period];
  if (!dataset) {
    throw new ConstructedCardUpstreamError(
      `Constructed card rank ${rank} period ${period} is not configured`,
    );
  }
  return dataset;
}

function periodDescriptor(period: ConstructedCardPeriod, payload?: JsonRecord): ConstructedCardPeriodDescriptor {
  const rawPatch = String(
    payload?.view?.patch
      ?? payload?.publication?.patch
      ?? payload?.patch
      ?? '',
  ).trim();
  return {
    id: period,
    label: period === 'patch' && rawPatch ? `Патч ${rawPatch}` : PERIOD_LABELS[period],
    timeRange: String(payload?.view?.time_range ?? PERIOD_TIME_RANGES[period] ?? '').trim() || null,
    patch: rawPatch || null,
  };
}

function rankDescriptor(rank: ConstructedCardRank, payload?: JsonRecord): ConstructedCardRankDescriptor {
  return {
    id: rank,
    label: RANK_LABELS[rank],
    rankRange: String(payload?.view?.rank_range ?? RANK_RANGES[rank]).trim() || RANK_RANGES[rank],
  };
}

function readPositiveInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function readHistoryDays(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? Math.max(7, Math.min(parsed, 365)) : 90;
}

function readFilter(value: unknown): string {
  return String(value ?? '').trim().slice(0, 120);
}

function readNumberFilter(value: unknown): number | null {
  const raw = readFilter(value);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentNumber(value: unknown): number | null {
  const raw = String(value ?? '').replace('%', '').replace(',', '.').trim();
  if (!raw || raw === '—' || raw === '-') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function searchableText(card: JsonRecord): string {
  return [card?.name?.ru, card?.name?.en, card?.card_id, card?.slug]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('ru');
}

export function cardMechanics(card: JsonRecord): string[] {
  return [...new Set([
    ...(Array.isArray(card?.mechanics) ? card.mechanics : []),
    ...(Array.isArray(card?.referenced_tags) ? card.referenced_tags : []),
  ].map(value => String(value).trim()).filter(isPublicConstructedTerm))];
}

function cardClasses(card: JsonRecord): string[] {
  return [...new Set([card?.class, ...(Array.isArray(card?.multi_class) ? card.multi_class : [])]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(value => VALID_CLASSES.has(value)))];
}

function cardMinionTypes(card: JsonRecord): string[] {
  return [...new Set([
    card?.minion_type,
    ...(Array.isArray(card?.minion_types) ? card.minion_types : []),
  ]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(Boolean))];
}

function compareNullableNumbers(left: unknown, right: unknown, direction: number): number {
  const a = finiteNumber(left);
  const b = finiteNumber(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function compareText(left: unknown, right: unknown, direction: number): number {
  return String(left ?? '').localeCompare(String(right ?? ''), 'ru', { sensitivity: 'base' }) * direction;
}

function compareSetRelease(left: unknown, right: unknown, direction: number): number {
  const leftSet = String(left ?? '').trim().toUpperCase();
  const rightSet = String(right ?? '').trim().toUpperCase();
  const index = (set: string) => {
    if (!set) return Number.MAX_SAFE_INTEGER;
    // A newly released set may reach the catalog before this fallback list is
    // updated. Keep unknown named sets ahead of known historical expansions.
    return CONSTRUCTED_SET_RELEASE_INDEX.get(set) ?? -1;
  };
  return (index(leftSet) - index(rightSet)) * direction
    || compareText(leftSet, rightSet, direction);
}

function sortCards(cards: JsonRecord[], sort: string, direction: 'asc' | 'desc'): JsonRecord[] {
  const numericDirection = direction === 'asc' ? 1 : -1;
  return [...cards].sort((left, right) => {
    let result = 0;
    if (sort === 'popularity') result = compareNullableNumbers(left?.stats?.deckPopularity, right?.stats?.deckPopularity, numericDirection);
    else if (sort === 'winrate') result = compareNullableNumbers(left?.stats?.deckWinrate, right?.stats?.deckWinrate, numericDirection);
    else if (sort === 'games') result = compareNullableNumbers(left?.stats?.timesPlayed, right?.stats?.timesPlayed, numericDirection);
    else if (sort === 'mana') result = compareNullableNumbers(left?.mana_cost, right?.mana_cost, numericDirection);
    else if (sort === 'attack') result = compareNullableNumbers(left?.attack, right?.attack, numericDirection);
    else if (sort === 'health') result = compareNullableNumbers(left?.health, right?.health, numericDirection);
    else if (sort === 'set') result = compareSetRelease(left?.card_set, right?.card_set, numericDirection);
    else if (sort === 'class') result = compareText(left?.class, right?.class, numericDirection);
    else if (sort === 'mechanics') result = compareText(cardMechanics(left).join(' '), cardMechanics(right).join(' '), numericDirection);
    else result = compareText(left?.name?.ru ?? left?.name?.en, right?.name?.ru ?? right?.name?.en, numericDirection);
    return result || compareText(left?.name?.ru ?? left?.name?.en, right?.name?.ru ?? right?.name?.en, 1);
  });
}

function uniqueSorted(values: unknown[]): string[] {
  return [...new Set(values.map(value => String(value ?? '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, 'ru', { sensitivity: 'base' }));
}

function countedValues(values: unknown[]): Array<{ value: string; count: number }> {
  const counts = new Map<string, number>();
  for (const rawValue of values) {
    const value = String(rawValue ?? '').trim();
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value, 'ru', { sensitivity: 'base' }));
}

export function queryConstructedCards(cards: JsonRecord[], query: Record<string, unknown>) {
  const search = readFilter(query.query).toLocaleLowerCase('ru');
  const className = readFilter(query.class).toUpperCase();
  const deckClass = readFilter(query.deckClass).toUpperCase();
  const cardSet = readFilter(query.set).toUpperCase();
  const mechanic = readFilter(query.mechanic).toUpperCase();
  const minionType = readFilter(query.minionType).toUpperCase();
  const spellSchool = readFilter(query.spellSchool).toUpperCase();
  const type = readFilter(query.type).toUpperCase();
  const rarity = readFilter(query.rarity).toUpperCase();
  const manaFilter = readFilter(query.mana).toUpperCase();
  const manaTenPlus = manaFilter === '10+';
  const mana = manaTenPlus ? null : readNumberFilter(query.mana);
  const attack = readNumberFilter(query.attack);
  const health = readNumberFilter(query.health);
  const sort = SORTS.has(String(query.sort)) ? String(query.sort) : 'set';
  const direction = query.direction === 'desc' ? 'desc' : 'asc';

  const filtered = cards.filter(card => {
    if (search && !searchableText(card).includes(search)) return false;
    const classes = cardClasses(card);
    if (deckClass && !classes.includes(deckClass) && !classes.includes('NEUTRAL')) return false;
    if (className && !classes.includes(className)) return false;
    if (cardSet && String(card?.card_set ?? '').toUpperCase() !== cardSet) return false;
    if (mechanic && !cardMechanics(card).map(value => value.toUpperCase()).includes(mechanic)) return false;
    if (minionType && !cardMinionTypes(card).includes(minionType)) return false;
    if (spellSchool && String(card?.spell_school ?? '').toUpperCase() !== spellSchool) return false;
    if (type && String(card?.card_type?.slug ?? '').toUpperCase() !== type) return false;
    if (rarity && String(card?.rarity ?? '').toUpperCase() !== rarity) return false;
    if (manaTenPlus && (finiteNumber(card?.mana_cost) ?? -1) < 10) return false;
    if (mana !== null && finiteNumber(card?.mana_cost) !== mana) return false;
    if (attack !== null && finiteNumber(card?.attack) !== attack) return false;
    if (health !== null && finiteNumber(card?.health) !== health) return false;
    return true;
  });

  return sortCards(filtered, sort, direction);
}

export function constructedCardFacets(cards: JsonRecord[]) {
  return {
    classes: uniqueSorted(cards.flatMap(cardClasses)),
    sets: uniqueSorted(cards.map(card => card?.card_set)),
    mechanics: uniqueSorted(cards.flatMap(cardMechanics)),
    minionTypes: uniqueSorted(cards.flatMap(cardMinionTypes)),
    spellSchools: uniqueSorted(cards.map(card => card?.spell_school)),
    types: uniqueSorted(cards.map(card => card?.card_type?.slug)),
    rarities: uniqueSorted(cards.map(card => card?.rarity)),
  };
}

export function constructedCardFacetCounts(cards: JsonRecord[]) {
  return {
    classes: countedValues(cards.flatMap(cardClasses)),
    sets: countedValues(cards.map(card => card?.card_set)),
    mechanics: countedValues(cards.flatMap(cardMechanics)),
    minionTypes: countedValues(cards.flatMap(cardMinionTypes)),
    spellSchools: countedValues(cards.map(card => card?.spell_school)),
    types: countedValues(cards.map(card => card?.card_type?.slug)),
    rarities: countedValues(cards.map(card => card?.rarity)),
  };
}

export function constructedCardCoverage(cards: JsonRecord[]) {
  const cardsWithStats = cards.filter(card => card?.stats !== null && card?.stats !== undefined).length;
  return {
    totalCards: cards.length,
    cardsWithStats,
    cardsWithoutStats: cards.length - cardsWithStats,
    totalSets: new Set(cards.map(card => String(card?.card_set ?? '').trim()).filter(Boolean)).size,
  };
}

export function redactConstructedCardStatistics(card: JsonRecord): JsonRecord {
  return {
    ...card,
    stats: null,
    statsUpdatedAt: null,
    statsSourceUrl: null,
    decks: Array.isArray(card?.decks)
      ? card.decks.map((deck: JsonRecord) => ({ ...deck, winrate: null, score: null }))
      : card?.decks,
  };
}

export function normalizeConstructedCardStats(row: JsonRecord | undefined): JsonRecord | null {
  if (!row) return null;
  const timesPlayed = finiteNumber(row.times_played);
  const hasReliableRateSample = timesPlayed !== null && timesPlayed >= MIN_RELIABLE_CONSTRUCTED_CARD_GAMES;
  return {
    deckPopularity: percentNumber(row.deck_popularity),
    deckWinrate: hasReliableRateSample ? percentNumber(row.deck_winrate) : null,
    averageCopies: finiteNumber(row.avg_copies),
    timesPlayed,
    winrateWhenPlayed: hasReliableRateSample ? percentNumber(row.winrate_when_played) : null,
    winrateWhenDrawn: hasReliableRateSample ? percentNumber(row.winrate_when_drawn) : null,
    keepPercentage: hasReliableRateSample ? percentNumber(row.keep_percentage) : null,
    openingHandWinrate: hasReliableRateSample ? percentNumber(row.opening_hand_winrate) : null,
    averageTurnsInHand: finiteNumber(row.avg_turns_in_hand),
    averageTurnPlayed: finiteNumber(row.avg_turn_played_on),
  };
}

export function validateConstructedCardStatsDataset(statsCards: JsonRecord[]): void {
  if (!statsCards.length) throw new Error('Constructed card statistics dataset is empty');
  let invalidPopularity = 0;
  let extremePopularity = 0;
  let cardsWithPopularity = 0;
  for (const row of statsCards) {
    const raw = String(row?.deck_popularity ?? '').replace('%', '').replace(',', '.').trim();
    if (!raw || raw === '—' || raw === '-') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      invalidPopularity += 1;
      continue;
    }
    cardsWithPopularity += 1;
    if (value >= 80) extremePopularity += 1;
  }
  if (!cardsWithPopularity) throw new Error('Constructed card statistics have no deck popularity values');
  if (invalidPopularity > Math.max(3, Math.ceil(statsCards.length * 0.01))) {
    throw new Error(`Constructed card statistics contain ${invalidPopularity} invalid popularity values`);
  }
  // A cross-class constructed sample cannot contain a large block of cards
  // present in almost every deck. Reject a wrong column or malformed stale
  // snapshot instead of publishing the familiar 97–100% cascade.
  if (extremePopularity >= 10) {
    throw new Error(`Constructed card statistics contain ${extremePopularity} implausible popularity values`);
  }
}

export function mergeConstructedCardRows(catalogCards: JsonRecord[], statsCards: JsonRecord[]): JsonRecord[] {
  const statsByCardId = new Map<string, JsonRecord>();
  const statsByDbf = new Map<number, JsonRecord>();
  for (const row of statsCards) {
    const cardId = String(row?.id ?? '').trim().toUpperCase();
    const dbf = finiteNumber(row?.dbfId);
    if (cardId) statsByCardId.set(cardId, row);
    if (dbf !== null) statsByDbf.set(dbf, row);
  }
  const matchedStats = new Set<JsonRecord>();
  const representedCardIds = new Set(catalogCards.map(card => String(card?.card_id ?? '').trim().toUpperCase()).filter(Boolean));
  const representedDbfs = new Set(catalogCards.map(card => finiteNumber(card?.dbf)).filter((value): value is number => value !== null));
  const mergedCards: JsonRecord[] = catalogCards.map(card => {
    const cardId = String(card?.card_id ?? '').trim().toUpperCase();
    const dbf = finiteNumber(card?.dbf);
    const stats = statsByCardId.get(cardId) ?? (dbf !== null ? statsByDbf.get(dbf) : undefined);
    if (stats) matchedStats.add(stats);
    return { ...card, stats: normalizeConstructedCardStats(stats) };
  });

  // The catalog and HSReplay snapshots are refreshed independently. Keep a
  // newly observed statistics row visible during the short window before the
  // card database catches up instead of silently dropping it from the UI.
  for (const row of statsCards) {
    if (matchedStats.has(row)) continue;
    const cardId = String(row?.id ?? '').trim();
    if (!cardId) continue;
    const normalizedCardId = cardId.toUpperCase();
    const dbf = finiteNumber(row?.dbfId);
    if (representedCardIds.has(normalizedCardId) || (dbf !== null && representedDbfs.has(dbf))) continue;
    representedCardIds.add(normalizedCardId);
    if (dbf !== null) representedDbfs.add(dbf);
    mergedCards.push({
      card_id: cardId,
      dbf,
      name: { ru: String(row?.name ?? '').trim() || null, en: null },
      text: { ru: null, en: null },
      flavor: { ru: null, en: null },
      card_set: null,
      card_type: { slug: String(row?.type ?? '').trim() || null, name_ru: null },
      rarity: String(row?.rarity ?? '').trim() || null,
      class: String(row?.cardClass ?? '').trim() || null,
      multi_class: [],
      mana_cost: finiteNumber(row?.cost),
      attack: null,
      health: null,
      mechanics: [],
      referenced_tags: [],
      images: { card: null, golden: null, signature: null, diamond: null, crop: null },
      catalogPending: true,
      stats: normalizeConstructedCardStats(row),
    });
  }
  return mergedCards;
}

type CompleteCatalogCandidate = {
  cards: JsonRecord[];
  expectedTotal: number;
  sourceUpdatedAt: string | null;
};

export function completeConstructedCatalogCandidate(
  payloads: JsonRecord[],
  expectedFormat?: ConstructedCardFormat,
): CompleteCatalogCandidate {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw new ConstructedCardCatalogCandidateError('Constructed catalog has no pages');
  }
  const firstPage = payloads[0] ?? {};
  if (!firstPage?.pagination || typeof firstPage.pagination !== 'object' || Array.isArray(firstPage.pagination)) {
    throw new ConstructedCardCatalogCandidateError('Constructed catalog first page has no pagination envelope');
  }
  const declaredPages = Number(firstPage.pagination.total_pages);
  if (!Number.isSafeInteger(declaredPages) || declaredPages < 1 || declaredPages !== payloads.length) {
    throw new ConstructedCardCatalogCandidateError(
      `Constructed catalog page sequence is incomplete: ${payloads.length}/${String(declaredPages)}`,
    );
  }
  const expectedTotal = Number(firstPage.pagination.total);
  if (!Number.isSafeInteger(expectedTotal) || expectedTotal < 1) {
    throw new ConstructedCardCatalogCandidateError('Constructed catalog total is missing or invalid');
  }
  const cards: JsonRecord[] = [];
  const ids = new Set<string>();
  for (const [index, payload] of payloads.entries()) {
    const pagination = payload?.pagination;
    if (!pagination || typeof pagination !== 'object' || Array.isArray(pagination)) {
      throw new ConstructedCardCatalogCandidateError(`Constructed catalog page ${index + 1} has no pagination envelope`);
    }
    const declaredPage = Number(pagination.page);
    const pageTotal = Number(pagination.total);
    const pageCount = Number(pagination.total_pages);
    const rawFormat = String(payload?.format ?? payload?.meta?.format ?? pagination?.format ?? '').trim().toLowerCase();
    if (expectedFormat && (rawFormat === 'standard' || rawFormat === 'wild') && rawFormat !== expectedFormat) {
      throw new ConstructedCardCatalogCandidateError(
        `Constructed catalog format envelope ${rawFormat} contradicts requested ${expectedFormat}`,
      );
    }
    if (!Number.isSafeInteger(declaredPage) || declaredPage !== index + 1
      || !Number.isSafeInteger(pageTotal) || pageTotal !== expectedTotal
      || !Number.isSafeInteger(pageCount) || pageCount !== declaredPages
      || !Array.isArray(payload?.data)) {
      throw new ConstructedCardCatalogCandidateError(`Constructed catalog page ${index + 1} is missing or discontinuous`);
    }
    for (const card of payload.data) {
      const key = String(card?.card_id ?? '').trim().toUpperCase();
      if (!key) throw new ConstructedCardCatalogCandidateError('Constructed catalog contains a card without identity');
      if (ids.has(key)) throw new ConstructedCardCatalogCandidateError(`Constructed catalog contains duplicate card ID ${key}`);
      ids.add(key);
      cards.push(card);
    }
  }
  if (cards.length !== expectedTotal) {
    throw new ConstructedCardCatalogCandidateError(
      `Constructed catalog is incomplete: received ${cards.length} of ${expectedTotal} cards`,
    );
  }
  const sourceUpdatedAt = String(
    firstPage?.updated_at
      ?? firstPage?.updatedAt
      ?? firstPage?.meta?.updated_at
      ?? firstPage?.meta?.updatedAt
      ?? '',
  ).trim() || null;
  return { cards, expectedTotal, sourceUpdatedAt };
}

export function completeConstructedCatalog(payloads: JsonRecord[]): JsonRecord[] {
  return completeConstructedCatalogCandidate(payloads).cards;
}

export function enrichConstructedCardPools(detail: JsonRecord, catalogCards: JsonRecord[]): JsonRecord {
  const pools = detail?.wiki?.generated_card_pools;
  if (!Array.isArray(pools)) return detail;

  const catalogById = new Map(
    catalogCards
      .map(card => [String(card?.card_id ?? '').trim().toUpperCase(), card] as const)
      .filter(([cardId]) => Boolean(cardId)),
  );
  const generatedCardPools = pools.map((pool: JsonRecord) => {
    const rawCards = Array.isArray(pool?.cards) ? pool.cards : [];
    const cardIds = Array.isArray(pool?.card_ids) ? pool.card_ids : [];
    const items = rawCards.length > 0 ? rawCards : cardIds.map((cardId: unknown) => ({ card_id: cardId }));
    const seen = new Set<string>();
    const cards = items.flatMap((item: JsonRecord) => {
      const cardId = String(item?.card_id ?? item?.id ?? '').trim();
      const key = cardId.toUpperCase();
      if (!cardId || seen.has(key)) return [];
      seen.add(key);
      const catalogCard = catalogById.get(key);
      return [{
        ...item,
        card_id: cardId,
        name: catalogCard?.name ?? item?.name ?? { ru: null, en: item?.title ?? null },
        images: catalogCard?.images ?? item?.images,
        image_url: catalogCard?.images?.card ?? item?.image_url ?? item?.image ?? null,
        can_open: Boolean(catalogCard),
      }];
    });
    return { ...pool, cards };
  });

  return { ...detail, wiki: { ...detail.wiki, generated_card_pools: generatedCardPools } };
}

export function enrichConstructedRelatedCards(detail: JsonRecord, catalogCards: JsonRecord[]): JsonRecord {
  const related = detail?.wiki?.related_cards;
  if (!Array.isArray(related)) return detail;

  const catalogById = new Map(
    catalogCards
      .map(card => [String(card?.card_id ?? '').trim().toUpperCase(), card] as const)
      .filter(([cardId]) => Boolean(cardId)),
  );
  const seen = new Set<string>();
  const relatedCards = related.flatMap((item: JsonRecord) => {
    const cardId = String(item?.card_id ?? item?.id ?? '').trim();
    const catalogCard = cardId ? catalogById.get(cardId.toUpperCase()) : undefined;
    const imageUrl = catalogCard?.images?.card ?? item?.image_url ?? item?.image ?? null;
    const rawName = catalogCard?.name ?? item?.name ?? null;
    const name = rawName && typeof rawName === 'object' ? rawName : { ru: null, en: String(rawName ?? '').trim() || null };
    const title = String(item?.name_ru ?? item?.title ?? name?.ru ?? name?.en ?? cardId).trim();
    const url = String(item?.url ?? '').trim() || null;
    if (!cardId && !title && !imageUrl && !url) return [];
    const key = (cardId || url || `${title}|${imageUrl ?? ''}`).toUpperCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [{
      ...item,
      card_id: cardId || null,
      name,
      name_ru: String(name?.ru ?? item?.name_ru ?? '').trim() || null,
      image_url: imageUrl,
      can_open: Boolean(catalogCard),
    }];
  });

  return { ...detail, wiki: { ...detail.wiki, related_cards: relatedCards } };
}

function deckFormatMatches(row: JsonRecord, decodedFormat: number, format: ConstructedCardFormat): boolean {
  const explicit = String(row?.format ?? '').trim().toLowerCase();
  if (explicit === 'standard' || explicit === 'wild') return explicit === format;
  return format === 'standard' ? decodedFormat === 2 : decodedFormat === 1;
}

export function translateConstructedArchetype(name: string, translations: Record<string, string>): string {
  const normalizedName = name.toLocaleLowerCase('en-US').trim();
  if (!normalizedName) return name;
  if (translations[normalizedName]) return translations[normalizedName];
  if (CONSTRUCTED_ARCHETYPE_FALLBACK_RU[normalizedName]) return CONSTRUCTED_ARCHETYPE_FALLBACK_RU[normalizedName];
  let bestMatch = '';
  let bestLength = 0;
  for (const [source, translated] of Object.entries(translations)) {
    const normalizedSource = source.toLocaleLowerCase('en-US').trim();
    if (normalizedSource && normalizedName.includes(normalizedSource) && normalizedSource.length > bestLength) {
      bestMatch = translated;
      bestLength = normalizedSource.length;
    }
  }
  return bestMatch || name;
}

export function constructedDecksContainingCard(
  rows: JsonRecord[],
  card: JsonRecord,
  format: ConstructedCardFormat,
  limit = Number.MAX_SAFE_INTEGER,
): ConstructedCardDeck[] {
  const dbf = finiteNumber(card?.dbf);
  if (dbf === null) return [];
  const seenCodes = new Set<string>();
  let fallbackId = 0;
  const matches = rows.flatMap((row: JsonRecord) => {
    const deckCode = String(row?.deck_code ?? '').trim();
    if (!/^[A-Za-z0-9+/=]{40,}$/.test(deckCode) || seenCodes.has(deckCode)) return [];
    try {
      const decoded = decode(deckCode);
      if (!deckFormatMatches(row, decoded.format, format) || !decoded.cards.some(([cardDbf]) => cardDbf === dbf)) return [];
    } catch {
      return [];
    }
    seenCodes.add(deckCode);
    fallbackId += 1;
    const rawId = String(row?.id ?? '').trim();
    const id = /^[A-Za-z0-9_-]{1,80}$/.test(rawId) ? rawId : `deck-${fallbackId}`;
    const archetype = String(row?.archetype ?? '').trim() || null;
    const title = String(row?.title ?? '').trim() || archetype || `Колода ${fallbackId}`;
    return [{
      id,
      title,
      archetype,
      archetypeLabel: archetype || title,
      className: String(row?.class ?? '').trim() || null,
      deckCode,
      source: String(row?.source_id ?? '').trim() || null,
      sourceUrl: String(row?.url ?? '').trim() || null,
      winrate: finiteNumber(row?.win_rate ?? row?.winrate),
      score: String(row?.score ?? '').trim() || null,
      updatedAt: String(row?.updated_at ?? row?.added_at ?? '').trim() || null,
    }];
  });
  return matches
    .sort((left, right) => Date.parse(right.updatedAt ?? '') - Date.parse(left.updatedAt ?? ''))
    .slice(0, Math.max(1, limit));
}

function normalizedPatchVersion(value: unknown): string {
  return String(value ?? '').trim().replace(/^patch\s+/i, '').trim().toLocaleLowerCase('en-US');
}

export function enrichConstructedCardPatches(detail: JsonRecord, patches: JsonRecord[]): JsonRecord {
  const groups = detail?.wiki?.patch_changes;
  if (!Array.isArray(groups) || patches.length === 0) return detail;

  const patchesByVersion = new Map<string, JsonRecord>();
  for (const patch of patches) {
    for (const version of [patch?.version, patch?.display_version]) {
      const key = normalizedPatchVersion(version);
      if (key && !patchesByVersion.has(key)) patchesByVersion.set(key, patch);
    }
  }

  const patchChanges = groups.map((group: JsonRecord) => ({
    ...group,
    entries: Array.isArray(group?.entries) ? group.entries.map((entry: JsonRecord) => {
      const match = patchesByVersion.get(normalizedPatchVersion(entry?.patch));
      if (!match) return entry;
      return {
        ...entry,
        manacost_title: String(match?.title ?? '').trim() || null,
        manacost_url: String(match?.source_url ?? '').trim() || null,
        manacost_published_at: String(match?.published_at ?? match?.official_published_at ?? '').trim() || null,
        manacost_summary: String(match?.summary ?? match?.excerpt ?? '').trim() || null,
      };
    }) : [],
  }));

  return { ...detail, wiki: { ...detail.wiki, patch_changes: patchChanges } };
}

async function fetchCatalogPage(dependencies: DataServiceDependencies, format: ConstructedCardFormat, page: number): Promise<any> {
  const url = new URL(`${dependencies.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards`);
  url.searchParams.set('format', format);
  url.searchParams.set('collectible', '1');
  url.searchParams.set('per_page', '200');
  url.searchParams.set('page', String(page));
  return dependencies.fetchJson(url.toString());
}

export function createConstructedCardDataService(dependencies: DataServiceDependencies): ConstructedCardDataService {
  const now = dependencies.now ?? Date.now;
  const cacheTtlMs = Math.max(1_000, Math.min(15 * 60_000, dependencies.cacheTtlMs ?? 5 * 60_000));
  const catalogStore = dependencies.catalogStore ?? new ConstructedCardCatalogStore({
    stateDirectory: dependencies.stateDirectory ?? process.env.SERVER_DATA_DIR ?? 'server/data',
    now,
    maxStaleMs: dependencies.maxCatalogStaleMs,
    minimumCardCountByFormat: dependencies.minimumCatalogCardsByFormat,
    freshWindowMs: cacheTtlMs,
  });
  const historyStore = dependencies.historyStore ?? new ConstructedCardHistoryStore({
    stateDirectory: dependencies.stateDirectory ?? process.env.SERVER_DATA_DIR ?? 'server/data',
    now,
  });
  type CatalogLoad = {
    document: ConstructedCardCatalogDocument;
    cacheSource: 'fresh' | 'LKG';
    dataStatus: 'fresh' | 'stale';
    warning: string | null;
  };
  const catalogCache = new Map<ConstructedCardFormat, { value: CatalogLoad; expiresAt: number }>();
  const catalogJobs = new Map<ConstructedCardFormat, Promise<CatalogLoad>>();
  const cache = new Map<string, { value: ConstructedCardCollection; expiresAt: number }>();
  const jobs = new Map<string, Promise<ConstructedCardCollection>>();
  const detailCache = new Map<string, { value: JsonRecord; expiresAt: number }>();
  const negativeDetailCache = new Map<string, number>();
  const negativeDetailCacheMaxEntries = Math.max(1, Math.min(
    10_000,
    Math.floor(dependencies.negativeDetailCacheMaxEntries ?? 512),
  ));
  const detailJobs = new Map<string, Promise<ConstructedCardDetailResult | null>>();
  type SecondarySourceLoad = { value: JsonRecord[]; degraded: boolean; warning: string | null };
  let patchesCache: { value: JsonRecord[]; expiresAt: number } | null = null;
  let patchesJob: Promise<SecondarySourceLoad> | null = null;
  let decksCache: { value: JsonRecord[]; expiresAt: number } | null = null;
  let decksJob: Promise<SecondarySourceLoad> | null = null;
  let generation = 0;

  const loadPatches = async (): Promise<SecondarySourceLoad> => {
    if (!dependencies.patchesUrl) return { value: [], degraded: false, warning: null };
    const current = now();
    if (patchesCache && patchesCache.expiresAt > current) {
      return { value: patchesCache.value, degraded: false, warning: null };
    }
    if (patchesJob) return patchesJob;
    const jobGeneration = generation;
    const job = dependencies.fetchJson(dependencies.patchesUrl)
      .then(payload => {
        if (!Array.isArray(payload?.patches)) {
          throw new ConstructedCardUpstreamError('Constructed card patches payload is invalid');
        }
        return payload.patches;
      })
      .then(value => {
        if (generation === jobGeneration) patchesCache = { value, expiresAt: now() + cacheTtlMs };
        return { value, degraded: false, warning: null } satisfies SecondarySourceLoad;
      })
      .catch(() => ({
        value: patchesCache?.value ?? [],
        degraded: true,
        warning: 'История изменений из таблицы патчей временно недоступна.',
      }))
      .finally(() => { if (patchesJob === job) patchesJob = null; });
    patchesJob = job;
    return job;
  };

  const loadDeckRows = async (): Promise<SecondarySourceLoad> => {
    if (!dependencies.constructedDecksUrl) return { value: [], degraded: false, warning: null };
    const current = now();
    if (decksCache && decksCache.expiresAt > current) {
      return { value: decksCache.value, degraded: false, warning: null };
    }
    if (decksJob) return decksJob;
    const jobGeneration = generation;
    const job = (async () => {
      const rowsFromPayload = (payload: JsonRecord): JsonRecord[] => {
        if (Array.isArray(payload?.data)) return payload.data;
        if (Array.isArray(payload?.decks)) return payload.decks;
        throw new ConstructedCardUpstreamError('Constructed deck payload is invalid');
      };
      const totalFromPayload = (payload: JsonRecord): number => {
        const rawTotal = payload?.meta?.count ?? payload?.total;
        const total = Number(rawTotal);
        if (!Number.isSafeInteger(total) || total < 0 || total > 20_000) {
          throw new ConstructedCardUpstreamError('Constructed deck total is invalid');
        }
        return total;
      };
      const firstUrl = new URL(dependencies.constructedDecksUrl!);
      firstUrl.searchParams.set('limit', '200');
      firstUrl.searchParams.set('offset', '0');
      const firstPayload = await dependencies.fetchJson(firstUrl.toString());
      const total = totalFromPayload(firstPayload);
      const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 200) - 1) }, (_, index) => (index + 1) * 200);
      const payloads = await Promise.all(offsets.map(async offset => {
        const url = new URL(dependencies.constructedDecksUrl!);
        url.searchParams.set('limit', '200');
        url.searchParams.set('offset', String(offset));
        return dependencies.fetchJson(url.toString());
      }));
      const identities = new Set<string>();
      const value = [firstPayload, ...payloads].flatMap((payload, pageIndex) => {
        const offset = pageIndex * 200;
        const pageTotal = totalFromPayload(payload);
        if (pageTotal !== total) throw new ConstructedCardUpstreamError('Constructed deck page totals are inconsistent');
        if (payload?.meta?.offset !== undefined && Number(payload.meta.offset) !== offset) {
          throw new ConstructedCardUpstreamError('Constructed deck page offset is inconsistent');
        }
        if (payload?.meta?.limit !== undefined && Number(payload.meta.limit) !== 200) {
          throw new ConstructedCardUpstreamError('Constructed deck page limit is inconsistent');
        }
        const rows = rowsFromPayload(payload);
        const expectedRows = Math.min(200, Math.max(0, total - offset));
        if (rows.length !== expectedRows) {
          throw new ConstructedCardUpstreamError(
            `Constructed deck page ${pageIndex + 1} has ${rows.length}/${expectedRows} rows`,
          );
        }
        for (const row of rows) {
          const rawId = String(row?.id ?? '').trim();
          const deckCode = String(row?.deck_code ?? '').trim();
          const identity = rawId ? `id:${rawId}` : deckCode ? `code:${deckCode}` : '';
          if (!identity || identities.has(identity)) {
            throw new ConstructedCardUpstreamError('Constructed deck pages contain an invalid or duplicate stable identity');
          }
          identities.add(identity);
        }
        return rows;
      });
      if (value.length !== total) throw new ConstructedCardUpstreamError('Constructed deck pages are incomplete');
      if (generation === jobGeneration) decksCache = { value, expiresAt: now() + cacheTtlMs };
      return { value, degraded: false, warning: null } satisfies SecondarySourceLoad;
    })().catch(() => ({
      value: decksCache?.value ?? [],
      degraded: true,
      warning: 'Колоды с этой картой временно недоступны.',
    })).finally(() => { if (decksJob === job) decksJob = null; });
    decksJob = job;
    return job;
  };

  const loadCatalog = async (format: ConstructedCardFormat): Promise<CatalogLoad> => {
    const current = now();
    const cached = catalogCache.get(format);
    if (cached && cached.expiresAt > current) return cached.value;
    const active = catalogJobs.get(format);
    if (active) return active;
    const jobGeneration = generation;
    const job = (async () => {
      let value: CatalogLoad;
      try {
        const firstPage = await fetchCatalogPage(dependencies, format, 1);
        const totalPages = Number(firstPage?.pagination?.total_pages);
        if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 100) {
          throw new ConstructedCardCatalogCandidateError('Constructed catalog page count is invalid');
        }
        const remainingPages = await Promise.all(
          Array.from({ length: totalPages - 1 }, (_, index) => fetchCatalogPage(dependencies, format, index + 2)),
        );
        const candidate = completeConstructedCatalogCandidate([firstPage, ...remainingPages], format);
        const document = catalogStore.publish(format, candidate.cards, {
          expectedTotal: candidate.expectedTotal,
          sourceUpdatedAt: candidate.sourceUpdatedAt,
          controlledExpansion: dependencies.controlledCatalogExpansionByFormat?.[format] === true,
        });
        const inspection = catalogStore.inspect(format);
        const persistenceDegraded = Boolean(inspection.repairWarning);
        value = {
          document,
          cacheSource: persistenceDegraded ? 'LKG' : 'fresh',
          dataStatus: persistenceDegraded ? 'stale' : 'fresh',
          warning: persistenceDegraded
            ? 'Каталог карт сохранён без резервной копии. Показывается проверенная основная версия.'
            : null,
        };
      } catch (error) {
        const lastKnownGood = catalogStore.readUsable(format);
        if (!lastKnownGood) {
          throw new ConstructedCardCatalogUnavailableError(undefined, { cause: error });
        }
        value = {
          document: lastKnownGood.document,
          cacheSource: 'LKG',
          dataStatus: 'stale',
          warning: lastKnownGood.repairWarning
            ? 'Резервная копия каталога повреждена или недоступна. Показывается последняя проверенная версия.'
            : null,
        };
      }
      if (generation === jobGeneration) {
        catalogCache.set(format, { value, expiresAt: now() + cacheTtlMs });
      }
      return value;
    })().finally(() => {
      if (catalogJobs.get(format) === job) catalogJobs.delete(format);
    });
    catalogJobs.set(format, job);
    return job;
  };

  const loadCards = async (
    format: ConstructedCardFormat,
    period: ConstructedCardPeriod = '1d',
    rank: ConstructedCardRank = 'legend',
  ): Promise<ConstructedCardCollection> => {
    const key = `${format}:${rank}:${period}`;
    const current = now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > current) return cached.value;
    const active = jobs.get(key);
    if (active) return active;

    const jobGeneration = generation;
    const job = (async () => {
      const catalog = await loadCatalog(format);
      const statsDataset = statsDatasetFor(dependencies, format, period, rank);
      let statsPayload: JsonRecord = {};
      let statsCards: JsonRecord[] = [];
      let statsWarning = false;
      try {
        statsPayload = await dependencies.fetchJson(`${dependencies.statsBaseUrl.replace(/\/$/, '')}/${statsDataset}`);
        statsCards = Array.isArray(statsPayload?.view?.cards) ? statsPayload.view.cards : [];
        validateConstructedCardStatsDataset(statsCards);
      } catch {
        statsWarning = true;
        statsCards = [];
      }
      const warnings = [
        catalog.dataStatus === 'stale' ? 'Показывается последняя сохранённая версия библиотеки карт.' : '',
        catalog.warning ?? '',
        statsWarning ? 'Статистика карт временно недоступна.' : '',
      ].filter((warning, index, values) => Boolean(warning) && values.indexOf(warning) === index);
      const value: ConstructedCardCollection = {
        cards: mergeConstructedCardRows(catalog.document.cards, statsCards),
        updatedAt: String(statsPayload?.fetched_at ?? '') || null,
        sourceUrl: String(statsPayload?.url ?? statsPayload?.view?.source ?? '') || dependencies.catalogBaseUrl,
        warning: warnings.join(' ') || null,
        cacheSource: catalog.cacheSource,
        dataStatus: catalog.dataStatus,
        partial: false,
        datasetVersion: catalog.document.datasetVersion,
        catalogVerifiedAt: catalog.document.verifiedAt,
        catalogPublishedAt: catalog.document.publishedAt,
        period: periodDescriptor(period, statsPayload),
        rank: rankDescriptor(rank, statsPayload),
      };
      if (!statsWarning) {
        try {
          historyStore.recordSnapshot(
            format,
            period,
            rank,
            value.updatedAt,
            value.cards,
          );
        } catch (error) {
          dependencies.onHistoryError?.(error);
        }
      }
      if (generation === jobGeneration) cache.set(key, { value, expiresAt: now() + cacheTtlMs });
      return value;
    })().finally(() => { if (jobs.get(key) === job) jobs.delete(key); });
    jobs.set(key, job);
    return job;
  };

  const composeDetailResult = (
    detail: JsonRecord,
    catalogCollection: ConstructedCardCollection,
    statsCollection: ConstructedCardCollection,
    options: { partial: boolean; fallback: boolean; warning: string | null },
  ): ConstructedCardDetailResult => {
    const detailId = String(detail?.card_id ?? '').trim().toUpperCase();
    const current = statsCollection.cards.find(card => String(card?.card_id ?? '').trim().toUpperCase() === detailId);
    const decks = Array.isArray(detail?.decks) ? detail.decks.map((deck: JsonRecord) => options.fallback
      ? { ...deck, winrate: null, score: null }
      : deck) : [];
    const warning = [options.warning, catalogCollection.warning, statsCollection.warning]
      .flatMap(value => String(value ?? '').trim() ? [String(value).trim()] : [])
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' ') || null;
    return {
      card: {
        ...detail,
        stats: current?.stats ?? null,
        statsUpdatedAt: current?.stats ? statsCollection.updatedAt : null,
        statsSourceUrl: current?.stats ? statsCollection.sourceUrl : null,
        decks,
      },
      cacheSource: options.fallback
        || catalogCollection.cacheSource === 'LKG'
        || statsCollection.cacheSource === 'LKG'
        ? 'LKG'
        : 'fresh',
      dataStatus: options.fallback
        || catalogCollection.dataStatus === 'stale'
        || statsCollection.dataStatus === 'stale'
        ? 'stale'
        : 'fresh',
      partial: options.partial,
      warning,
      datasetVersion: catalogCollection.datasetVersion,
      period: statsCollection.period,
      rank: statsCollection.rank,
    };
  };

  const enrichDetail = async (
    format: ConstructedCardFormat,
    detail: JsonRecord,
    collection: ConstructedCardCollection,
  ): Promise<{ value: JsonRecord; partial: boolean; warning: string | null }> => {
    const [patches, deckRows, archetypeTranslations] = await Promise.all([
      loadPatches(),
      loadDeckRows(),
      dependencies.getArchetypeTranslations?.().catch(() => ({})) ?? Promise.resolve({}),
    ]);
    const catalogIds = new Set(collection.cards.map(card => String(card?.card_id ?? '').trim().toUpperCase()).filter(Boolean));
    const missingRelatedIds: string[] = [...new Set<string>((Array.isArray(detail?.wiki?.related_cards) ? detail.wiki.related_cards : [])
      .map((item: JsonRecord) => String(item?.card_id ?? item?.id ?? '').trim())
      .filter((relatedId: string) => relatedId && !catalogIds.has(relatedId.toUpperCase())))];
    const relatedDetails = (await Promise.all(missingRelatedIds.map(async relatedId => {
      try {
        const relatedPayload = await dependencies.fetchJson(
          `${dependencies.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards/${encodeURIComponent(relatedId)}`,
        );
        return relatedPayload?.data && typeof relatedPayload.data === 'object' ? relatedPayload.data : null;
      } catch {
        return null;
      }
    }))).filter((card): card is JsonRecord => Boolean(card));
    const relatedCatalog = [...collection.cards, ...relatedDetails];
    const enriched = enrichConstructedCardPatches(
      enrichConstructedRelatedCards(enrichConstructedCardPools(detail, collection.cards), relatedCatalog),
      patches.value,
    );
    const warnings = [patches.warning, deckRows.warning]
      .filter((value): value is string => Boolean(value))
      .filter((value, index, values) => values.indexOf(value) === index);
    return {
      value: {
        ...enriched,
        decks: constructedDecksContainingCard(deckRows.value, detail, format).map(deck => ({
          ...deck,
          archetypeLabel: translateConstructedArchetype(deck.archetype || deck.title, archetypeTranslations),
        })),
      },
      partial: patches.degraded || deckRows.degraded,
      warning: warnings.join(' ') || null,
    };
  };

  const pruneNegativeDetailCache = (current: number) => {
    for (const [cachedKey, expiresAt] of negativeDetailCache) {
      if (expiresAt <= current) negativeDetailCache.delete(cachedKey);
    }
  };

  const rememberMissingDetail = (key: string) => {
    const current = now();
    pruneNegativeDetailCache(current);
    negativeDetailCache.delete(key);
    while (negativeDetailCache.size >= negativeDetailCacheMaxEntries) {
      const oldest = negativeDetailCache.keys().next().value as string | undefined;
      if (!oldest) break;
      negativeDetailCache.delete(oldest);
    }
    negativeDetailCache.set(key, current + 60_000);
  };

  const loadCardDetail = async (
    format: ConstructedCardFormat,
    cardId: string,
    period: ConstructedCardPeriod = '1d',
    statsFormat: ConstructedCardFormat = format,
    rank: ConstructedCardRank = 'legend',
  ): Promise<ConstructedCardDetailResult | null> => {
    const key = `${format}:${statsFormat}:${rank}:${period}:${cardId.toUpperCase()}`;
    const current = now();
    pruneNegativeDetailCache(current);
    if ((negativeDetailCache.get(key) ?? 0) > current) return null;
    const active = detailJobs.get(key);
    if (active) return active;
    const jobGeneration = generation;
    const job = (async () => {
      const catalogCollection = await loadCards(format, period, rank);
      const statsCollection = statsFormat === format
        ? catalogCollection
        : await loadCards(statsFormat, period, rank);
      const normalizedCardId = cardId.toUpperCase();
      const knownCard = catalogCollection.cards.find(
        card => String(card?.card_id ?? '').trim().toUpperCase() === normalizedCardId,
      );
      const cached = detailCache.get(key);
      if (cached && cached.expiresAt > now()) {
        return composeDetailResult(
          cached.value,
          catalogCollection,
          statsCollection,
          { partial: false, fallback: false, warning: null },
        );
      }
      const url = `${dependencies.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards/${encodeURIComponent(cardId)}?include=wiki`;
      try {
        const payload = await dependencies.fetchJson(url);
        const detail = payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? payload.data as JsonRecord
          : null;
        const returnedId = String(detail?.card_id ?? '').trim().toUpperCase();
        if (!detail || returnedId !== normalizedCardId) {
          throw new ConstructedCardUpstreamError('Constructed card detail payload is invalid');
        }
        const enriched = await enrichDetail(format, detail, catalogCollection);
        if (enriched.partial) {
          return composeDetailResult(cached?.value ?? enriched.value, catalogCollection, statsCollection, {
            partial: true,
            fallback: true,
            warning: enriched.warning,
          });
        }
        if (generation === jobGeneration) detailCache.set(key, { value: enriched.value, expiresAt: now() + cacheTtlMs });
        return composeDetailResult(
          enriched.value,
          catalogCollection,
          statsCollection,
          { partial: false, fallback: false, warning: null },
        );
      } catch (error) {
        if (!knownCard) {
          if (error instanceof ConstructedCardUpstreamError && error.status === 404 && generation === jobGeneration) {
            rememberMissingDetail(key);
            return null;
          }
          throw new ConstructedCardDetailUnavailableError(undefined, { cause: error });
        }
        const fallback = cached?.value ?? { ...knownCard, wiki: knownCard.wiki ?? {}, decks: [] };
        return composeDetailResult(fallback, catalogCollection, statsCollection, {
          partial: true,
          fallback: true,
          warning: cached
            ? 'Показывается последняя сохранённая версия подробной информации о карте.'
            : 'Часть подробной информации о карте временно недоступна.',
        });
      }
    })().finally(() => { if (detailJobs.get(key) === job) detailJobs.delete(key); });
    detailJobs.set(key, job);
    return job;
  };

  const loadCardHistory = async (
    format: ConstructedCardFormat,
    cardId: string,
    period: ConstructedCardPeriod = '1d',
    rank: ConstructedCardRank = 'legend',
    days = 90,
  ): Promise<ConstructedCardHistoryPoint[]> => historyStore.read(format, period, rank, cardId, days);

  const getCatalogHealth = (format: ConstructedCardFormat): ConstructedCardCatalogHealth => {
    const cached = catalogCache.get(format)?.value;
    const inspection = catalogStore.inspect(format);
    const document = cached?.document ?? inspection.document;
    const unavailable = !document || inspection.state === 'expired';
    const degraded = !unavailable && (
      !cached
      || cached.dataStatus === 'stale'
      || inspection.state !== 'fresh'
      || Boolean(inspection.repairWarning)
    );
    return {
      format,
      state: unavailable ? inspection.state : degraded ? 'stale' : 'fresh',
      dataStatus: unavailable ? 'unavailable' : degraded ? 'stale' : 'fresh',
      cacheSource: unavailable ? null : degraded ? 'LKG' : 'fresh',
      verifiedAt: document?.verifiedAt ?? null,
      publishedAt: document?.publishedAt ?? null,
      records: document?.count ?? 0,
      datasetVersion: document?.datasetVersion ?? null,
      warning: cached?.warning ?? inspection.repairWarning,
    };
  };

  const invalidate = () => {
    generation += 1;
    catalogCache.clear();
    catalogJobs.clear();
    cache.clear();
    jobs.clear();
    detailCache.clear();
    negativeDetailCache.clear();
    detailJobs.clear();
    patchesCache = null;
    patchesJob = null;
    decksCache = null;
    decksJob = null;
  };

  return { loadCards, loadCardDetail, loadCardHistory, getCatalogHealth, invalidate };
}

export function createConstructedCardRouter(dependencies: ConstructedCardRouterDependencies): Router {
  const router = Router();
  const protectAdminCards: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  router.use('/constructed-cards', protectAdminCards);
  router.use('/admin/constructed-cards', dependencies.adminGuard, protectAdminCards);

  const setDataHeaders = (response: Response, value: {
    cacheSource: 'fresh' | 'LKG';
    datasetVersion: string;
    dataStatus: 'fresh' | 'stale';
  }) => {
    response.set('X-Data-Cache', value.cacheSource);
    response.set('X-Dataset-Version', value.datasetVersion);
    if (value.dataStatus === 'stale') response.set('Warning', '110 - "Response is Stale"');
  };

  const unavailable = (response: Response, error: unknown, scope: 'list' | 'detail' | 'history') => {
    dependencies.onError?.(scope, error);
    response.set('Retry-After', '60');
    return response.status(503).json({
      error: scope === 'list'
        ? 'Библиотека карт временно недоступна. Повторите попытку через минуту.'
        : scope === 'history'
          ? 'История статистики временно недоступна. Повторите попытку через минуту.'
          : 'Данные карты временно недоступны. Повторите попытку через минуту.',
      retryAfter: 60,
      dataStatus: 'unavailable',
    });
  };

  const listHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format);
    const period = readPeriod(request.query.period);
    const rank = readRank(request.query.rank);
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!period) return response.status(400).json({ error: 'Неизвестный период статистики' });
    if (!rank) return response.status(400).json({ error: 'Неизвестный ранг статистики' });
    const page = readPositiveInteger(request.query.page, 1);
    const perPage = readPositiveInteger(request.query.perPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    try {
      const statsAccess = Boolean(await dependencies.canAccessStats?.(request));
      const collection = await dependencies.loadCards(format, period, rank);
      const requestedSort = String(request.query.sort ?? '');
      const safeQuery = !statsAccess && STATISTIC_SORTS.has(requestedSort)
        ? { ...request.query, sort: 'set', direction: 'asc' }
        : request.query;
      const cards = queryConstructedCards(collection.cards, safeQuery as Record<string, unknown>);
      const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * perPage;
      const responsePeriod = collection.period ?? periodDescriptor(period);
      const responseRank = collection.rank ?? rankDescriptor(rank);
      setDataHeaders(response, collection);
      return response.json({
        format,
        rank: responseRank.id,
        rankLabel: responseRank.label,
        rankRange: responseRank.rankRange,
        timeRange: responsePeriod.id,
        period: responsePeriod,
        updatedAt: collection.updatedAt,
        sourceUrl: collection.sourceUrl,
        statsAccess,
        dataStatus: collection.dataStatus,
        partial: false,
        datasetVersion: collection.datasetVersion,
        cards: cards.slice(offset, offset + perPage).map(card => statsAccess ? card : redactConstructedCardStatistics(card)),
        facets: constructedCardFacets(collection.cards),
        facetCounts: constructedCardFacetCounts(collection.cards),
        mechanicTranslations: dependencies.getMechanicTranslations?.() ?? {},
        mechanicOverrides: dependencies.getMechanicTranslationOverrides?.(),
        coverage: constructedCardCoverage(collection.cards),
        warning: collection.warning ?? null,
        pagination: { page: safePage, perPage, total: cards.length, totalPages },
      });
    } catch (error) {
      return unavailable(response, error, 'list');
    }
  };
  router.get('/constructed-cards', listHandler);
  router.get('/admin/constructed-cards', listHandler);

  const detailHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format);
    const statsFormat = readFormat(request.query.statsFormat ?? request.query.format);
    const period = readPeriod(request.query.period);
    const rank = readRank(request.query.rank);
    const cardId = String(request.params.cardId ?? '').trim();
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!statsFormat) return response.status(400).json({ error: 'Неизвестный формат статистики' });
    if (!period) return response.status(400).json({ error: 'Неизвестный период статистики' });
    if (!rank) return response.status(400).json({ error: 'Неизвестный ранг статистики' });
    if (!/^[a-zA-Z0-9_]{2,80}$/.test(cardId)) return response.status(400).json({ error: 'Некорректный ID карты' });
    try {
      const statsAccess = Boolean(await dependencies.canAccessStats?.(request));
      const result = await dependencies.loadCardDetail(format, cardId, period, statsFormat, rank);
      if (!result) return response.status(404).json({ error: 'Карта не найдена', dataStatus: 'not-found' });
      const responsePeriod = result.period ?? periodDescriptor(period);
      const responseRank = result.rank ?? rankDescriptor(rank);
      setDataHeaders(response, result);
      return response.json({
        format,
        statsFormat,
        rank: responseRank.id,
        rankLabel: responseRank.label,
        rankRange: responseRank.rankRange,
        period: responsePeriod,
        statsAccess,
        dataStatus: result.dataStatus,
        partial: result.partial,
        warning: result.warning,
        datasetVersion: result.datasetVersion,
        mechanicTranslations: dependencies.getMechanicTranslations?.() ?? {},
        mechanicOverrides: dependencies.getMechanicTranslationOverrides?.(),
        card: statsAccess ? result.card : redactConstructedCardStatistics(result.card),
      });
    } catch (error) {
      return unavailable(response, error, 'detail');
    }
  };
  router.get('/constructed-cards/:cardId', detailHandler);
  router.get('/admin/constructed-cards/:cardId', detailHandler);

  const historyHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format);
    const period = readPeriod(request.query.period);
    const rank = readRank(request.query.rank);
    const cardId = String(request.params.cardId ?? '').trim();
    const days = readHistoryDays(request.query.days);
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!period) return response.status(400).json({ error: 'Неизвестный период статистики' });
    if (!rank) return response.status(400).json({ error: 'Неизвестный ранг статистики' });
    if (!/^[a-zA-Z0-9_]{2,80}$/.test(cardId)) return response.status(400).json({ error: 'Некорректный ID карты' });
    try {
      const statsAccess = Boolean(await dependencies.canAccessStats?.(request));
      const responsePeriod = periodDescriptor(period);
      const responseRank = rankDescriptor(rank);
      if (!statsAccess) {
        return response.json({
          format,
          rank: responseRank.id,
          rankLabel: responseRank.label,
          rankRange: responseRank.rankRange,
          period: responsePeriod,
          statsAccess: false,
          days,
          points: [],
        });
      }
      const collection = await dependencies.loadCards(format, period, rank);
      const points = await dependencies.loadCardHistory(format, cardId, period, rank, days);
      const collectionRank = collection.rank ?? responseRank;
      setDataHeaders(response, collection);
      return response.json({
        format,
        rank: collectionRank.id,
        rankLabel: collectionRank.label,
        rankRange: collectionRank.rankRange,
        period: collection.period ?? responsePeriod,
        statsAccess: true,
        days,
        updatedAt: collection.updatedAt,
        points,
      });
    } catch (error) {
      return unavailable(response, error, 'history');
    }
  };
  router.get('/constructed-cards/:cardId/history', historyHandler);
  router.get('/admin/constructed-cards/:cardId/history', historyHandler);

  const previewHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format ?? request.body?.format);
    const statsFormat = readFormat(
      request.query.statsFormat ?? request.body?.statsFormat ?? request.query.format ?? request.body?.format,
    );
    const period = readPeriod(request.query.period ?? request.body?.period);
    const rank = readRank(request.query.rank ?? request.body?.rank);
    const cardId = String(request.params.cardId ?? '').trim();
    const deckId = String(request.params.deckId ?? '').trim();
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!statsFormat) return response.status(400).json({ error: 'Неизвестный формат статистики' });
    if (!period) return response.status(400).json({ error: 'Неизвестный период статистики' });
    if (!rank) return response.status(400).json({ error: 'Неизвестный ранг статистики' });
    if (!/^[a-zA-Z0-9_]{2,80}$/.test(cardId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(deckId)) {
      return response.status(400).json({ error: 'Некорректный ID карты или колоды' });
    }
    if (!dependencies.createDeckPreview) return response.status(503).json({ error: 'DeckView временно недоступен' });
    try {
      // Resolve the deck again on the server so this endpoint cannot be
      // used to render an arbitrary deck code supplied by the browser.
      const result = await dependencies.loadCardDetail(format, cardId, period, statsFormat, rank);
      const deck = (Array.isArray(result?.card?.decks) ? result.card.decks : []).find((item: ConstructedCardDeck) => item.id === deckId);
      if (!deck) return response.status(404).json({ error: 'Колода с этой картой не найдена' });
      return response.json({ preview: await dependencies.createDeckPreview(deck) });
    } catch (error) {
      dependencies.onError?.('deck-preview', error);
      return response.status(502).json({ error: 'Не удалось создать изображение колоды' });
    }
  };
  router.post('/constructed-cards/:cardId/decks/:deckId/preview', previewHandler);
  router.post('/admin/constructed-cards/:cardId/decks/:deckId/preview', previewHandler);

  return router;
}
