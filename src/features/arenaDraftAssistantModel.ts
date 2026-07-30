import type {
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

export function fullCardImageUrl(cardId: string): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/full.webp`;
}

export function classIconUrl(classId: Exclude<ArenaClassId, 'ALL'>): string {
  const slug = classId.toLocaleLowerCase('en-US');
  return `/class_icon/ui/${slug}-64.webp`;
}
