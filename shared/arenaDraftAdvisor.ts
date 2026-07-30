import type {
  ArenaCombination,
  ArenaDraftAdvice,
  ArenaDraftAdvisorContext,
  ArenaDraftChoice,
  ArenaDraftCardCopyProfile,
  ArenaDraftModel,
  ArenaDraftCurveBucket,
  ArenaDraftSynergyEvidence,
  ArenaSynergyCard,
} from './arenaSynergyContract.js';

export type ArenaDraftAdvisorInputErrorCode =
  | 'DECK_TOO_LARGE'
  | 'INVALID_CARD_ID'
  | 'UNKNOWN_CARD'
  | 'INVALID_CANDIDATE_COUNT'
  | 'DUPLICATE_CANDIDATES';

export class ArenaDraftAdvisorInputError extends Error {
  readonly code: ArenaDraftAdvisorInputErrorCode;

  constructor(code: ArenaDraftAdvisorInputErrorCode, message: string) {
    super(message);
    this.name = 'ArenaDraftAdvisorInputError';
    this.code = code;
  }
}

export type RankArenaDraftChoicesInput = {
  context: ArenaDraftAdvisorContext;
  combinations: ArenaCombination[];
  deckCardIds: string[];
  candidateCardIds: [string, string, string] | string[];
};

const SYNERGY_DECAY = [1, 0.6, 0.35] as const;
const MAX_CONTRIBUTING_SYNERGIES = SYNERGY_DECAY.length;
const CONTROLLED_DELTA_TO_COMPONENT_POINTS = 14;
const STAGE_MODELS: Record<ArenaDraftModel['stage'], ArenaDraftModel> = {
  early: {
    id: 'arena-draft-advisor-v2',
    stage: 'early',
    weights: { base: 0.65, synergy: 0.2, curve: 0.15 },
  },
  middle: {
    id: 'arena-draft-advisor-v2',
    stage: 'middle',
    weights: { base: 0.5, synergy: 0.3, curve: 0.2 },
  },
  late: {
    id: 'arena-draft-advisor-v2',
    stage: 'late',
    weights: { base: 0.35, synergy: 0.4, curve: 0.25 },
  },
};

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function pairKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function validateCardId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !id.trim() || id.length > 80) {
    throw new ArenaDraftAdvisorInputError(
      'INVALID_CARD_ID',
      'Идентификатор карты должен содержать от 1 до 80 символов.',
    );
  }
}

function percentileScores(cards: ArenaSynergyCard[]): Map<string, number> {
  const known = cards
    .filter(card => card.deckWinRate != null)
    .sort((left, right) => (
      (left.deckWinRate ?? 0) - (right.deckWinRate ?? 0)
      || left.id.localeCompare(right.id)
    ));
  const result = new Map<string, number>();
  if (known.length === 1) {
    result.set(known[0].id, 50);
    return result;
  }
  let index = 0;
  while (index < known.length) {
    let end = index + 1;
    while (end < known.length && known[end].deckWinRate === known[index].deckWinRate) {
      end += 1;
    }
    const averageRank = (index + end - 1) / 2;
    const percentile = (averageRank / (known.length - 1)) * 100;
    for (let tiedIndex = index; tiedIndex < end; tiedIndex += 1) {
      result.set(known[tiedIndex].id, percentile);
    }
    index = end;
  }
  return result;
}

function baseScore(
  card: ArenaSynergyCard,
  percentiles: ReadonlyMap<string, number>,
  minimumRuns: number,
): number {
  const percentile = percentiles.get(card.id);
  if (percentile == null) return 50;
  const support = clamp(card.runs / Math.max(1, minimumRuns), 0, 1);
  const reliability = 0.6 + support * 0.4;
  return round(50 + (percentile - 50) * reliability);
}

function curveBucket(
  cost: number | null,
  buckets: ArenaDraftCurveBucket[],
): ArenaDraftCurveBucket | null {
  if (cost == null || !Number.isFinite(cost)) return null;
  return buckets.find(bucket => (
    cost >= bucket.minimumCost
    && (bucket.maximumCost == null || cost <= bucket.maximumCost)
  )) ?? null;
}

function curveScore(
  card: ArenaSynergyCard,
  deckCards: ArenaSynergyCard[],
  buckets: ArenaDraftCurveBucket[],
): number {
  const candidateBucket = curveBucket(card.cost, buckets);
  if (!candidateBucket || buckets.length === 0) return 50;
  const counts = new Map(buckets.map(bucket => [bucket.id, 0]));
  for (const deckCard of [...deckCards, card]) {
    const bucket = curveBucket(deckCard.cost, buckets);
    if (bucket) counts.set(bucket.id, (counts.get(bucket.id) ?? 0) + 1);
  }
  const knownCards = Array.from(counts.values()).reduce((sum, count) => sum + count, 0);
  if (!knownCards) return 50;
  const distance = buckets.reduce((sum, bucket) => (
    sum + Math.abs((counts.get(bucket.id) ?? 0) / knownCards - bucket.targetShare)
  ), 0);
  const completedDeckScore = clamp((1 - distance / 2) * 100);
  const curveEvidenceWeight = clamp(deckCards.length / 10, 0, 1);
  return round(50 + (completedDeckScore - 50) * curveEvidenceWeight);
}

function draftModel(deckSize: number): ArenaDraftModel {
  if (deckSize < 10) return STAGE_MODELS.early;
  if (deckSize < 20) return STAGE_MODELS.middle;
  return STAGE_MODELS.late;
}

function redundancyPenalty(
  cardId: string,
  deckCardIds: string[],
  copyProfiles: ArenaDraftCardCopyProfile[],
): number {
  const profile = copyProfiles.find(item => item.cardId === cardId);
  if (!profile) return 0;
  const currentCopies = deckCardIds.reduce(
    (count, deckCardId) => count + Number(deckCardId === cardId),
    0,
  );
  const nextCopies = currentCopies + 1;
  const typicalCopies = Math.max(
    1,
    Math.min(profile.maxObservedCopies, Math.round(profile.averageCopiesWhenPresent)),
  );
  return nextCopies > typicalCopies
    ? Math.min(12, (nextCopies - typicalCopies) * 4)
    : 0;
}

function synergyEvidence(
  card: ArenaSynergyCard,
  deckCardIds: Set<string>,
  cardsById: ReadonlyMap<string, ArenaSynergyCard>,
  combinationsByPair: ReadonlyMap<string, ArenaCombination>,
): {
  score: number;
  synergies: ArenaDraftSynergyEvidence[];
  popularPairs: number;
} {
  const candidates: ArenaDraftSynergyEvidence[] = [];
  let popularPairs = 0;
  for (const partnerId of deckCardIds) {
    const combination = combinationsByPair.get(pairKey(card.id, partnerId));
    if (!combination) continue;
    if (
      combination.classification !== 'confirmed'
      && combination.classification !== 'promising'
    ) {
      popularPairs += 1;
      continue;
    }
    const partner = cardsById.get(partnerId);
    if (!partner) continue;
    const deltaPoints = Math.max(
      0,
      combination.controlledInteractionDeltaPoints
        ?? combination.adjustedInteractionDeltaPoints,
    );
    const classificationWeight = combination.classification === 'confirmed' ? 1 : 0.5;
    candidates.push({
      partner,
      classification: combination.classification,
      deltaPoints: round(deltaPoints),
      observedRuns: combination.observedRuns,
      contribution: round(
        deltaPoints * CONTROLLED_DELTA_TO_COMPONENT_POINTS * classificationWeight,
      ),
    });
  }
  const synergies = candidates
    .sort((left, right) => (
      right.contribution - left.contribution
      || right.observedRuns - left.observedRuns
      || left.partner.id.localeCompare(right.partner.id)
    ))
    .slice(0, MAX_CONTRIBUTING_SYNERGIES)
    .map((evidence, index) => ({
      ...evidence,
      contribution: round(evidence.contribution * SYNERGY_DECAY[index]),
    }));
  const bonus = synergies.reduce((sum, evidence) => sum + evidence.contribution, 0);
  return {
    score: round(clamp(50 + Math.min(50, bonus))),
    synergies,
    popularPairs,
  };
}

function choiceConfidence(
  card: ArenaSynergyCard,
  synergies: ArenaDraftSynergyEvidence[],
  minimumRuns: number,
): ArenaDraftChoice['confidence'] {
  const hasBaseStrength = card.deckWinRate != null && card.runs >= minimumRuns;
  if (hasBaseStrength && synergies.some(item => item.classification === 'confirmed')) {
    return 'high';
  }
  if (hasBaseStrength || synergies.some(item => item.classification === 'promising')) {
    return 'medium';
  }
  return 'low';
}

function choiceReasons(
  card: ArenaSynergyCard,
  components: ArenaDraftChoice['components'],
  synergies: ArenaDraftSynergyEvidence[],
): string[] {
  const reasons: string[] = [];
  if (card.deckWinRate != null) {
    reasons.push(`Базовая сила: ${round(card.deckWinRate)}% deck WR.`);
  }
  const confirmed = synergies.find(item => item.classification === 'confirmed');
  const promising = synergies.find(item => item.classification === 'promising');
  if (confirmed) {
    reasons.push(
      `Есть подтверждённая связка с «${confirmed.partner.name}» `
      + `(+${round(confirmed.deltaPoints)} п.п. против контроля).`,
    );
  } else if (promising) {
    reasons.push(
      `Есть перспективная связка с «${promising.partner.name}»; данных пока меньше.`,
    );
  } else {
    reasons.push('Доказанного дополнительного эффекта с текущей колодой нет.');
  }
  if (components.curve >= 65) {
    reasons.push('Карта хорошо закрывает текущую потребность манакривой.');
  } else if (components.curve < 40) {
    reasons.push('По манакривой этот слот уже заполнен лучше других.');
  }
  if (components.redundancyPenalty > 0) {
    reasons.push('Такое количество копий встречается в успешных колодах заметно реже.');
  }
  return reasons;
}

function choiceWarnings(
  card: ArenaSynergyCard,
  popularPairs: number,
  redundancy: number,
): string[] {
  const warnings: string[] = [];
  if (card.deckWinRate == null) {
    warnings.push('Нет надёжной отдельной статистики силы карты.');
  }
  if (card.cost == null) {
    warnings.push('Стоимость карты неизвестна: кривая оценена нейтрально.');
  }
  if (popularPairs > 0) {
    warnings.push(
      `${popularPairs} популярн${popularPairs === 1 ? 'ая пара не учтена' : 'ые пары не учтены'} `
      + 'без доказанного дополнительного эффекта.',
    );
  }
  if (redundancy > 0) {
    warnings.push(
      `Штраф ${round(redundancy)} балла за лишнюю копию основан только на текущей выборке 12-победных колод.`,
    );
  }
  return warnings;
}

export function rankArenaDraftChoices(input: RankArenaDraftChoicesInput): ArenaDraftAdvice {
  if (input.deckCardIds.length > input.context.deckSize) {
    throw new ArenaDraftAdvisorInputError(
      'DECK_TOO_LARGE',
      `В колоде Арены не может быть больше ${input.context.deckSize} карт.`,
    );
  }
  if (input.candidateCardIds.length !== 3) {
    throw new ArenaDraftAdvisorInputError(
      'INVALID_CANDIDATE_COUNT',
      'Для сравнения нужны ровно три предложенные карты.',
    );
  }
  [...input.deckCardIds, ...input.candidateCardIds].forEach(validateCardId);
  if (new Set(input.candidateCardIds).size !== input.candidateCardIds.length) {
    throw new ArenaDraftAdvisorInputError(
      'DUPLICATE_CANDIDATES',
      'Три предложенные карты должны быть разными.',
    );
  }

  const cardsById = new Map(input.context.cards.map(card => [card.id, card]));
  for (const id of [...input.deckCardIds, ...input.candidateCardIds]) {
    if (!cardsById.has(id)) {
      throw new ArenaDraftAdvisorInputError(
        'UNKNOWN_CARD',
        `Карта ${id} отсутствует в текущей выборке класса.`,
      );
    }
  }
  const deckCards = input.deckCardIds.map(id => cardsById.get(id)!);
  const uniqueDeckCardIds = new Set(input.deckCardIds);
  const percentiles = percentileScores(input.context.cards);
  const model = draftModel(input.deckCardIds.length);
  const combinationsByPair = new Map(input.combinations.map(combination => [
    pairKey(combination.cards[0].id, combination.cards[1].id),
    combination,
  ]));

  const choices = input.candidateCardIds.map(candidateId => {
    const card = cardsById.get(candidateId)!;
    const synergy = synergyEvidence(
      card,
      uniqueDeckCardIds,
      cardsById,
      combinationsByPair,
    );
    const redundancy = redundancyPenalty(
      card.id,
      input.deckCardIds,
      input.context.copyProfiles ?? [],
    );
    const components = {
      base: baseScore(card, percentiles, input.context.minimumRuns),
      synergy: synergy.score,
      curve: curveScore(card, deckCards, input.context.targetCurve),
      redundancyPenalty: redundancy,
    };
    const score = round(
      components.base * model.weights.base
      + components.synergy * model.weights.synergy
      + components.curve * model.weights.curve
      - components.redundancyPenalty,
    );
    return {
      rank: 0,
      card,
      score,
      components,
      confidence: choiceConfidence(card, synergy.synergies, input.context.minimumRuns),
      synergies: synergy.synergies,
      reasons: choiceReasons(card, components, synergy.synergies),
      warnings: choiceWarnings(card, synergy.popularPairs, redundancy),
    } satisfies ArenaDraftChoice;
  }).sort((left, right) => (
    right.score - left.score
    || right.components.base - left.components.base
    || left.card.name.localeCompare(right.card.name, 'ru')
  )).map((choice, index) => ({ ...choice, rank: index + 1 }));

  return {
    model,
    choices,
    isCloseDecision: choices.length >= 2 && choices[0].score - choices[1].score < 2,
    limitations: input.context.limitations,
  };
}
