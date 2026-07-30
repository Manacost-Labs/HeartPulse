import type {
  ArenaCombination,
  ArenaClassId,
  ArenaDraftAdvisorContext,
  ArenaSynergyCard,
} from '../../shared/arenaSynergyContract';

export type ArenaDraftAssistantState = {
  version: 1;
  classId: Exclude<ArenaClassId, 'ALL'>;
  deckCardIds: string[];
  candidateCardIds: [string, string, string];
  selectedCardId: string | null;
};

export type ArenaDraftDeckRow = {
  card: ArenaSynergyCard;
  count: number;
};

export type ArenaDraftCurveSnapshot = ArenaDraftAdvisorContext['targetCurve'][number] & {
  count: number;
  fillPercent: number;
};

export type ArenaDraftCandidateSuggestionInput = {
  deckCardIds: string[];
  context: ArenaDraftAdvisorContext;
  combinations: ArenaCombination[];
};

export const ARENA_DRAFT_ASSISTANT_STORAGE_KEY = 'arena-draft-assistant-v1';

export function createEmptyDraftState(
  classId: Exclude<ArenaClassId, 'ALL'>,
): ArenaDraftAssistantState {
  return {
    version: 1,
    classId,
    deckCardIds: [],
    candidateCardIds: ['', '', ''],
    selectedCardId: null,
  };
}

export function hydrateDraftState(
  value: unknown,
  classId: Exclude<ArenaClassId, 'ALL'>,
  cards: ArenaSynergyCard[],
): ArenaDraftAssistantState {
  const empty = createEmptyDraftState(classId);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return empty;
  const source = value as Partial<ArenaDraftAssistantState>;
  if (source.version !== 1 || source.classId !== classId) return empty;

  const knownCardIds = new Set(cards.map(card => card.id));
  const deckCardIds = Array.isArray(source.deckCardIds)
    ? source.deckCardIds
      .filter((id): id is string => typeof id === 'string' && knownCardIds.has(id))
      .slice(0, 30)
    : [];
  const rawCandidates = Array.isArray(source.candidateCardIds)
    ? source.candidateCardIds.slice(0, 3)
    : [];
  const candidateCardIds = [0, 1, 2].map(index => {
    const id = rawCandidates[index];
    return typeof id === 'string' && knownCardIds.has(id) ? id : '';
  }) as [string, string, string];
  const selectedCardId = typeof source.selectedCardId === 'string'
    && candidateCardIds.includes(source.selectedCardId)
    ? source.selectedCardId
    : null;

  return {
    version: 1,
    classId,
    deckCardIds,
    candidateCardIds,
    selectedCardId,
  };
}

export function groupDraftDeck(
  deckCardIds: string[],
  cards: ArenaSynergyCard[],
): ArenaDraftDeckRow[] {
  const cardsById = new Map(cards.map(card => [card.id, card]));
  const rows = new Map<string, ArenaDraftDeckRow>();
  for (const cardId of deckCardIds) {
    const card = cardsById.get(cardId);
    if (!card) continue;
    const row = rows.get(cardId);
    if (row) row.count += 1;
    else rows.set(cardId, { card, count: 1 });
  }
  return Array.from(rows.values()).sort((left, right) => (
    (left.card.cost ?? Number.MAX_SAFE_INTEGER) - (right.card.cost ?? Number.MAX_SAFE_INTEGER)
    || left.card.name.localeCompare(right.card.name, 'ru')
  ));
}

export function buildCurveSnapshot(
  deckCardIds: string[],
  context: ArenaDraftAdvisorContext,
): ArenaDraftCurveSnapshot[] {
  const cardsById = new Map(context.cards.map(card => [card.id, card]));
  return context.targetCurve.map(bucket => {
    const count = deckCardIds.reduce((total, cardId) => {
      const cost = cardsById.get(cardId)?.cost;
      if (
        cost == null
        || cost < bucket.minimumCost
        || (bucket.maximumCost != null && cost > bucket.maximumCost)
      ) return total;
      return total + 1;
    }, 0);
    return {
      ...bucket,
      count,
      fillPercent: Math.min(100, Math.round((count / Math.max(1, bucket.targetCount)) * 100)),
    };
  });
}

export function addDraftCard(
  deckCardIds: string[],
  cardId: string,
  deckSize: number,
): string[] {
  if (!cardId || deckCardIds.length >= deckSize) return deckCardIds;
  return [...deckCardIds, cardId];
}

export function removeDraftCardCopy(deckCardIds: string[], cardId: string): string[] {
  const index = deckCardIds.lastIndexOf(cardId);
  if (index < 0) return deckCardIds;
  return [...deckCardIds.slice(0, index), ...deckCardIds.slice(index + 1)];
}

function isLegendary(card: ArenaSynergyCard): boolean {
  return card.rarity?.toLocaleUpperCase('en-US') === 'LEGENDARY';
}

function curveNeedScore(
  card: ArenaSynergyCard,
  deckCardIds: string[],
  context: ArenaDraftAdvisorContext,
): number {
  if (card.cost == null) return 0;
  const snapshot = buildCurveSnapshot(deckCardIds, context);
  const bucket = snapshot.find(item => (
    card.cost != null
    && card.cost >= item.minimumCost
    && (item.maximumCost == null || card.cost <= item.maximumCost)
  ));
  if (!bucket) return 0;
  return Math.max(0, bucket.targetCount - bucket.count) / Math.max(1, bucket.targetCount);
}

function interactionScore(
  cardId: string,
  deckCardIds: string[],
  combinations: ArenaCombination[],
): number {
  const deck = new Set(deckCardIds);
  return combinations.reduce((total, combination) => {
    if (
      combination.classification !== 'confirmed'
      && combination.classification !== 'promising'
    ) return total;
    const [left, right] = combination.cards;
    const partnerId = left.id === cardId
      ? right.id
      : right.id === cardId ? left.id : null;
    if (!partnerId || !deck.has(partnerId)) return total;
    const delta = combination.controlledInteractionDeltaPoints
      ?? combination.adjustedInteractionDeltaPoints;
    if (!Number.isFinite(delta) || delta <= 0) return total;
    const evidenceWeight = combination.classification === 'confirmed' ? 1 : 0.55;
    return total + Math.min(5, delta) * evidenceWeight;
  }, 0);
}

function candidateSuggestionScore(
  card: ArenaSynergyCard,
  input: ArenaDraftCandidateSuggestionInput,
): number {
  const winRate = card.deckWinRate ?? 50;
  const runQuality = card.twelveWinRunQuality ?? 50;
  const evidence = Math.min(1, Math.log10(Math.max(1, card.runs) + 1) / 2);
  const curveNeed = curveNeedScore(card, input.deckCardIds, input.context);
  const synergy = interactionScore(card.id, input.deckCardIds, input.combinations);
  return (
    winRate * 0.7
    + runQuality * 0.3
    + evidence * 1.5
    + curveNeed * 1.25
    + Math.min(7, synergy)
  );
}

/**
 * Builds a useful recommendation triple from the already class-filtered cards
 * observed in the current Arena cohort. This is not an attempt to predict the
 * three random cards or the support cards shown by the game client.
 */
export function suggestArenaDraftCandidates(
  input: ArenaDraftCandidateSuggestionInput,
): [string, string, string] | null {
  const { context, deckCardIds } = input;
  if (deckCardIds.length >= context.deckSize) return null;

  const legendaryCards = context.cards.filter(isLegendary);
  const regularCards = context.cards.filter(card => !isLegendary(card));
  const eligibleCards = deckCardIds.length === 0 && legendaryCards.length >= 3
    ? legendaryCards
    : regularCards;
  if (eligibleCards.length < 3) return null;

  const ranked = [...eligibleCards].sort((left, right) => (
    candidateSuggestionScore(right, input) - candidateSuggestionScore(left, input)
    || right.runs - left.runs
    || left.name.localeCompare(right.name, 'ru')
    || left.id.localeCompare(right.id)
  ));
  return ranked.slice(0, 3).map(card => card.id) as [string, string, string];
}

export function fullCardImageUrl(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/full.webp`;
}

export function classIconUrl(classId: Exclude<ArenaClassId, 'ALL'>): string {
  const slug = classId.toLocaleLowerCase('en-US');
  return `/class_icon/ui/${slug}-64.webp`;
}
