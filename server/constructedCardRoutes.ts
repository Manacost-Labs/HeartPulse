import { Router, type RequestHandler, type Response } from 'express';
import { decode } from '@firestone-hs/deckstrings';

export type ConstructedCardFormat = 'standard' | 'wild';

type JsonRecord = Record<string, any>;

export type ConstructedCardCollection = {
  cards: JsonRecord[];
  updatedAt: string | null;
  sourceUrl: string;
};

export type ConstructedCardDataService = {
  loadCards: (format: ConstructedCardFormat) => Promise<ConstructedCardCollection>;
  loadCardDetail: (format: ConstructedCardFormat, cardId: string) => Promise<JsonRecord | null>;
};

export type ConstructedCardDeck = {
  id: string;
  title: string;
  archetype: string | null;
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
  setPrivateNoStore: (response: Response) => void;
  getMechanicTranslations?: () => Record<string, string>;
  createDeckPreview?: (deck: ConstructedCardDeck) => Promise<ConstructedCardDeckPreview>;
  onError?: (scope: 'list' | 'detail' | 'deck-preview', error: unknown) => void;
};

type DataServiceDependencies = {
  fetchJson: (url: string) => Promise<any>;
  catalogBaseUrl: string;
  statsDatasetByFormat: Record<ConstructedCardFormat, string>;
  statsBaseUrl: string;
  patchesUrl?: string;
  constructedDecksUrl?: string;
  cacheTtlMs?: number;
};

const FORMATS = new Set<ConstructedCardFormat>(['standard', 'wild']);
const DEFAULT_PAGE_SIZE = 60;
const MAX_PAGE_SIZE = 120;
const SORTS = new Set(['popularity', 'winrate', 'games', 'mana', 'attack', 'health', 'name', 'set', 'class', 'mechanics']);
const VALID_CLASSES = new Set([
  'DEATHKNIGHT', 'DEMONHUNTER', 'DRUID', 'HUNTER', 'MAGE', 'PALADIN',
  'PRIEST', 'ROGUE', 'SHAMAN', 'WARLOCK', 'WARRIOR', 'NEUTRAL', 'DREAM',
]);

function readFormat(value: unknown): ConstructedCardFormat | null {
  const format = String(value ?? 'standard') as ConstructedCardFormat;
  return FORMATS.has(format) ? format : null;
}

function readPositiveInteger(value: unknown, fallback: number, maximum = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
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
  return Number.isFinite(parsed) ? parsed : null;
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
  ].map(value => String(value).trim()).filter(value => Boolean(value) && !/^\d+$/.test(value)))];
}

function cardClasses(card: JsonRecord): string[] {
  return [...new Set([card?.class, ...(Array.isArray(card?.multi_class) ? card.multi_class : [])]
    .map(value => String(value ?? '').trim().toUpperCase())
    .filter(value => VALID_CLASSES.has(value)))];
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
    else if (sort === 'set') result = compareText(left?.card_set, right?.card_set, numericDirection);
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
  const cardSet = readFilter(query.set).toUpperCase();
  const mechanic = readFilter(query.mechanic).toUpperCase();
  const type = readFilter(query.type).toUpperCase();
  const rarity = readFilter(query.rarity).toUpperCase();
  const mana = readNumberFilter(query.mana);
  const attack = readNumberFilter(query.attack);
  const health = readNumberFilter(query.health);
  const sort = SORTS.has(String(query.sort)) ? String(query.sort) : 'popularity';
  const direction = query.direction === 'asc' ? 'asc' : 'desc';

  const filtered = cards.filter(card => {
    if (search && !searchableText(card).includes(search)) return false;
    const classes = cardClasses(card);
    if (className && !classes.includes(className)) return false;
    if (cardSet && String(card?.card_set ?? '').toUpperCase() !== cardSet) return false;
    if (mechanic && !cardMechanics(card).map(value => value.toUpperCase()).includes(mechanic)) return false;
    if (type && String(card?.card_type?.slug ?? '').toUpperCase() !== type) return false;
    if (rarity && String(card?.rarity ?? '').toUpperCase() !== rarity) return false;
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
    types: uniqueSorted(cards.map(card => card?.card_type?.slug)),
    rarities: uniqueSorted(cards.map(card => card?.rarity)),
  };
}

export function constructedCardFacetCounts(cards: JsonRecord[]) {
  return {
    classes: countedValues(cards.flatMap(cardClasses)),
    sets: countedValues(cards.map(card => card?.card_set)),
    mechanics: countedValues(cards.flatMap(cardMechanics)),
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

export function normalizeConstructedCardStats(row: JsonRecord | undefined): JsonRecord | null {
  if (!row) return null;
  return {
    deckPopularity: percentNumber(row.deck_popularity),
    deckWinrate: percentNumber(row.deck_winrate),
    averageCopies: finiteNumber(row.avg_copies),
    timesPlayed: finiteNumber(row.times_played),
    winrateWhenPlayed: percentNumber(row.winrate_when_played),
    winrateWhenDrawn: percentNumber(row.winrate_when_drawn),
    keepPercentage: percentNumber(row.keep_percentage),
    openingHandWinrate: percentNumber(row.opening_hand_winrate),
    averageTurnsInHand: finiteNumber(row.avg_turns_in_hand),
    averageTurnPlayed: finiteNumber(row.avg_turn_played_on),
  };
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

export function completeConstructedCatalog(payloads: JsonRecord[]): JsonRecord[] {
  const firstPage = payloads[0] ?? {};
  const expectedTotal = Math.max(0, Number(firstPage?.pagination?.total ?? 0));
  const cardsById = new Map<string, JsonRecord>();
  for (const card of payloads.flatMap(payload => Array.isArray(payload?.data) ? payload.data : [])) {
    const key = String(card?.card_id ?? '').trim().toUpperCase();
    if (key) cardsById.set(key, card);
  }
  const cards = [...cardsById.values()];
  if (expectedTotal > 0 && cards.length < expectedTotal) {
    throw new Error(`Constructed catalog is incomplete: received ${cards.length} of ${expectedTotal} cards`);
  }
  return cards;
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
  const cacheTtlMs = Math.max(60_000, dependencies.cacheTtlMs ?? 15 * 60_000);
  const cache = new Map<ConstructedCardFormat, { value: ConstructedCardCollection; expiresAt: number }>();
  const jobs = new Map<ConstructedCardFormat, Promise<ConstructedCardCollection>>();
  const detailCache = new Map<string, { value: JsonRecord; expiresAt: number }>();
  const detailJobs = new Map<string, Promise<JsonRecord | null>>();
  let patchesCache: { value: JsonRecord[]; expiresAt: number } | null = null;
  let patchesJob: Promise<JsonRecord[]> | null = null;
  let decksCache: { value: JsonRecord[]; expiresAt: number } | null = null;
  let decksJob: Promise<JsonRecord[]> | null = null;

  const loadPatches = async (): Promise<JsonRecord[]> => {
    if (!dependencies.patchesUrl) return [];
    const now = Date.now();
    if (patchesCache && patchesCache.expiresAt > now) return patchesCache.value;
    if (patchesJob) return patchesJob;
    patchesJob = dependencies.fetchJson(dependencies.patchesUrl)
      .then(payload => Array.isArray(payload?.patches) ? payload.patches : [])
      .then(value => {
        patchesCache = { value, expiresAt: Date.now() + cacheTtlMs };
        return value;
      })
      .catch(() => [])
      .finally(() => { patchesJob = null; });
    return patchesJob;
  };

  const loadDeckRows = async (): Promise<JsonRecord[]> => {
    if (!dependencies.constructedDecksUrl) return [];
    const now = Date.now();
    if (decksCache && decksCache.expiresAt > now) return decksCache.value;
    if (decksJob) return decksJob;
    decksJob = (async () => {
      const firstUrl = new URL(dependencies.constructedDecksUrl!);
      firstUrl.searchParams.set('limit', '200');
      firstUrl.searchParams.set('offset', '0');
      const firstPayload = await dependencies.fetchJson(firstUrl.toString());
      const firstRows = Array.isArray(firstPayload?.data) ? firstPayload.data : Array.isArray(firstPayload?.decks) ? firstPayload.decks : [];
      const total = Math.max(firstRows.length, Number(firstPayload?.meta?.count ?? firstPayload?.total ?? firstRows.length));
      const offsets = Array.from({ length: Math.max(0, Math.ceil(total / 200) - 1) }, (_, index) => (index + 1) * 200);
      const payloads = await Promise.all(offsets.map(async offset => {
        const url = new URL(dependencies.constructedDecksUrl!);
        url.searchParams.set('limit', '200');
        url.searchParams.set('offset', String(offset));
        return dependencies.fetchJson(url.toString());
      }));
      const value = [firstPayload, ...payloads].flatMap(payload => Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.decks) ? payload.decks : []);
      decksCache = { value, expiresAt: Date.now() + cacheTtlMs };
      return value;
    })().catch(() => []).finally(() => { decksJob = null; });
    return decksJob;
  };

  const loadCards = async (format: ConstructedCardFormat): Promise<ConstructedCardCollection> => {
    const now = Date.now();
    const cached = cache.get(format);
    if (cached && cached.expiresAt > now) return cached.value;
    const active = jobs.get(format);
    if (active) return active;

    const job = (async () => {
      const firstPage = await fetchCatalogPage(dependencies, format, 1);
      const totalPages = Math.max(1, Number(firstPage?.pagination?.total_pages ?? 1));
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, totalPages - 1) }, (_, index) => fetchCatalogPage(dependencies, format, index + 2)),
      );
      const catalogCards = completeConstructedCatalog([firstPage, ...remainingPages]);
      const statsDataset = dependencies.statsDatasetByFormat[format];
      const statsPayload = await dependencies.fetchJson(`${dependencies.statsBaseUrl.replace(/\/$/, '')}/${statsDataset}`);
      const statsCards = Array.isArray(statsPayload?.view?.cards) ? statsPayload.view.cards : [];
      const value = {
        cards: mergeConstructedCardRows(catalogCards, statsCards),
        updatedAt: String(statsPayload?.fetched_at ?? '') || null,
        sourceUrl: String(statsPayload?.url ?? statsPayload?.view?.source ?? ''),
      };
      cache.set(format, { value, expiresAt: Date.now() + cacheTtlMs });
      return value;
    })().finally(() => jobs.delete(format));
    jobs.set(format, job);
    return job;
  };

  const loadCardDetail = async (format: ConstructedCardFormat, cardId: string): Promise<JsonRecord | null> => {
    const key = `${format}:${cardId.toUpperCase()}`;
    const cached = detailCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const active = detailJobs.get(key);
    if (active) return active;
    const job = (async () => {
      const url = `${dependencies.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards/${encodeURIComponent(cardId)}?include=wiki`;
      const payload = await dependencies.fetchJson(url);
      const detail = payload?.data && typeof payload.data === 'object' ? payload.data : null;
      if (!detail) return null;
      const [collection, patches, deckRows] = await Promise.all([loadCards(format), loadPatches(), loadDeckRows()]);
      const merged = collection.cards.find(card => String(card?.card_id ?? '').toUpperCase() === String(detail.card_id ?? '').toUpperCase());
      const catalogIds = new Set(collection.cards.map(card => String(card?.card_id ?? '').trim().toUpperCase()).filter(Boolean));
      const missingRelatedIds: string[] = [...new Set<string>((Array.isArray(detail?.wiki?.related_cards) ? detail.wiki.related_cards : [])
        .map((item: JsonRecord) => String(item?.card_id ?? item?.id ?? '').trim())
        .filter((relatedId: string) => relatedId && !catalogIds.has(relatedId.toUpperCase())))];
      const relatedDetails = (await Promise.all(missingRelatedIds.map(async relatedId => {
        try {
          const relatedPayload = await dependencies.fetchJson(`${dependencies.catalogBaseUrl.replace(/\/$/, '')}/constructed-cards/${encodeURIComponent(relatedId)}`);
          return relatedPayload?.data && typeof relatedPayload.data === 'object' ? relatedPayload.data : null;
        } catch {
          return null;
        }
      }))).filter((card): card is JsonRecord => Boolean(card));
      const relatedCatalog = [...collection.cards, ...relatedDetails];
      const enrichedDetail = enrichConstructedCardPatches(
        enrichConstructedRelatedCards(enrichConstructedCardPools(detail, collection.cards), relatedCatalog),
        patches,
      );
      const value = {
        ...enrichedDetail,
        stats: merged?.stats ?? null,
        statsUpdatedAt: collection.updatedAt,
        statsSourceUrl: collection.sourceUrl,
        decks: constructedDecksContainingCard(deckRows, detail, format),
      };
      detailCache.set(key, { value, expiresAt: Date.now() + cacheTtlMs });
      return value;
    })().finally(() => detailJobs.delete(key));
    detailJobs.set(key, job);
    return job;
  };

  return { loadCards, loadCardDetail };
}

export function createConstructedCardRouter(dependencies: ConstructedCardRouterDependencies): Router {
  const router = Router();
  const protectAdminCards: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  router.use('/admin/constructed-cards', dependencies.adminGuard, protectAdminCards);

  router.get('/admin/constructed-cards', async (request, response) => {
    const format = readFormat(request.query.format);
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    const page = readPositiveInteger(request.query.page, 1);
    const perPage = readPositiveInteger(request.query.perPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    try {
      const collection = await dependencies.loadCards(format);
      const cards = queryConstructedCards(collection.cards, request.query as Record<string, unknown>);
      const totalPages = Math.max(1, Math.ceil(cards.length / perPage));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * perPage;
      return response.json({
        format,
        rank: 'legend',
        timeRange: '1d',
        updatedAt: collection.updatedAt,
        sourceUrl: collection.sourceUrl,
        cards: cards.slice(offset, offset + perPage),
        facets: constructedCardFacets(collection.cards),
        facetCounts: constructedCardFacetCounts(collection.cards),
        mechanicTranslations: dependencies.getMechanicTranslations?.() ?? {},
        coverage: constructedCardCoverage(collection.cards),
        pagination: { page: safePage, perPage, total: cards.length, totalPages },
      });
    } catch (error) {
      dependencies.onError?.('list', error);
      return response.status(502).json({ error: 'Библиотека карт временно недоступна' });
    }
  });

  router.get('/admin/constructed-cards/:cardId', async (request, response) => {
    const format = readFormat(request.query.format);
    const cardId = String(request.params.cardId ?? '').trim();
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!/^[a-zA-Z0-9_]{2,80}$/.test(cardId)) return response.status(400).json({ error: 'Некорректный ID карты' });
    try {
      const card = await dependencies.loadCardDetail(format, cardId);
      if (!card) return response.status(404).json({ error: 'Карта не найдена' });
      return response.json({ format, rank: 'legend', mechanicTranslations: dependencies.getMechanicTranslations?.() ?? {}, card });
    } catch (error) {
      dependencies.onError?.('detail', error);
      return response.status(502).json({ error: 'Данные карты временно недоступны' });
    }
  });

  router.post('/admin/constructed-cards/:cardId/decks/:deckId/preview', async (request, response) => {
    const format = readFormat(request.query.format ?? request.body?.format);
    const cardId = String(request.params.cardId ?? '').trim();
    const deckId = String(request.params.deckId ?? '').trim();
    if (!format) return response.status(400).json({ error: 'Неизвестный формат карт' });
    if (!/^[a-zA-Z0-9_]{2,80}$/.test(cardId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(deckId)) {
      return response.status(400).json({ error: 'Некорректный ID карты или колоды' });
    }
    if (!dependencies.createDeckPreview) return response.status(503).json({ error: 'DeckView временно недоступен' });
    try {
      // Resolve the deck again on the server so this admin endpoint cannot be
      // used to render an arbitrary deck code supplied by the browser.
      const card = await dependencies.loadCardDetail(format, cardId);
      const deck = (Array.isArray(card?.decks) ? card.decks : []).find((item: ConstructedCardDeck) => item.id === deckId);
      if (!deck) return response.status(404).json({ error: 'Колода с этой картой не найдена' });
      return response.json({ preview: await dependencies.createDeckPreview(deck) });
    } catch (error) {
      dependencies.onError?.('deck-preview', error);
      return response.status(502).json({ error: 'Не удалось создать изображение колоды' });
    }
  });

  return router;
}
