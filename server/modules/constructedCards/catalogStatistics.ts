export type ConstructedCardStatisticsSource = {
  [key: string]: unknown;
  id?: unknown;
  dbfId?: unknown;
  name?: unknown;
  type?: unknown;
  rarity?: unknown;
  cardClass?: unknown;
  cost?: unknown;
  deck_popularity?: unknown;
  deck_winrate?: unknown;
  avg_copies?: unknown;
  times_played?: unknown;
  winrate_when_played?: unknown;
  winrate_when_drawn?: unknown;
  keep_percentage?: unknown;
  opening_hand_winrate?: unknown;
  avg_turns_in_hand?: unknown;
  avg_turn_played_on?: unknown;
};

export type ConstructedCatalogCard = {
  [key: string]: unknown;
  card_id?: unknown;
  dbf?: unknown;
};

export type NormalizedConstructedCardStatistics = {
  deckPopularity: number | null;
  deckWinrate: number | null;
  averageCopies: number | null;
  timesPlayed: number | null;
  winrateWhenPlayed: number | null;
  winrateWhenDrawn: number | null;
  keepPercentage: number | null;
  openingHandWinrate: number | null;
  averageTurnsInHand: number | null;
  averageTurnPlayed: number | null;
};

export type ConstructedCardWithStatistics = {
  [key: string]: unknown;
  card_id?: unknown;
  dbf?: unknown;
  stats: NormalizedConstructedCardStatistics | null;
  catalogPending?: true;
};

// One-day card slices contain a long tail with only a handful of observations.
// Keep the sample count visible, but do not publish unstable rate metrics.
export const MIN_RELIABLE_CONSTRUCTED_CARD_GAMES = 100;

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

/** Normalizes one statistics row and suppresses rate metrics from unreliable samples. */
export function normalizeConstructedCardStats(
  row: ConstructedCardStatisticsSource | undefined,
): NormalizedConstructedCardStatistics | null {
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

/**
 * Checks whether a popularity snapshot is plausible enough to publish.
 *
 * This guard intentionally does not validate every statistics field. It rejects
 * empty snapshots, missing popularity signals and systemic popularity corruption.
 */
export function validateConstructedCardStatsDataset(
  statsCards: readonly ConstructedCardStatisticsSource[],
): void {
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

/** Joins catalog and statistics identities while retaining newly observed statistics-only cards. */
export function mergeConstructedCardRows(
  catalogCards: readonly ConstructedCatalogCard[],
  statsCards: readonly ConstructedCardStatisticsSource[],
): ConstructedCardWithStatistics[] {
  const statsByCardId = new Map<string, ConstructedCardStatisticsSource>();
  const statsByDbf = new Map<number, ConstructedCardStatisticsSource>();
  for (const row of statsCards) {
    const cardId = String(row?.id ?? '').trim().toUpperCase();
    const dbf = finiteNumber(row?.dbfId);
    if (cardId) statsByCardId.set(cardId, row);
    if (dbf !== null) statsByDbf.set(dbf, row);
  }
  const matchedStats = new Set<ConstructedCardStatisticsSource>();
  const representedCardIds = new Set(catalogCards.map(card => String(card?.card_id ?? '').trim().toUpperCase()).filter(Boolean));
  const representedDbfs = new Set(catalogCards.map(card => finiteNumber(card?.dbf)).filter((value): value is number => value !== null));
  const mergedCards: ConstructedCardWithStatistics[] = catalogCards.map(card => {
    const cardId = String(card?.card_id ?? '').trim().toUpperCase();
    const dbf = finiteNumber(card?.dbf);
    const stats = statsByCardId.get(cardId) ?? (dbf !== null ? statsByDbf.get(dbf) : undefined);
    if (stats) matchedStats.add(stats);
    return { ...card, stats: normalizeConstructedCardStats(stats) };
  });

  // The catalog and statistics snapshots are refreshed independently. Keep a
  // new statistics row visible until the card database catches up.
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
      catalogPending: true as const,
      stats: normalizeConstructedCardStats(row),
    });
  }
  return mergedCards;
}
