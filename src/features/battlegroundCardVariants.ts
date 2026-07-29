export interface BattlegroundVariantCard {
  card_id: string;
  dbf: number;
  attack?: number | null;
  health?: number | null;
  text_ru?: string;
  images?: {
    card?: string | null;
    golden?: string | null;
  };
}

export interface BattlegroundCardVariants<T extends BattlegroundVariantCard> {
  normal: T | null;
  golden: T | null;
}

export function isBattlegroundGoldenCardId(cardId: string): boolean {
  return /_G($|t$)/.test(cardId);
}

export function battlegroundBaseCardId(cardId: string): string {
  return cardId.replace(/_Gt$/, 't').replace(/_G$/, '');
}

export function findBattlegroundCardVariants<T extends BattlegroundVariantCard>(
  currentCard: T,
  candidates: T[],
): BattlegroundCardVariants<T> {
  const baseId = battlegroundBaseCardId(currentCard.card_id);
  const matchingCards = [currentCard, ...candidates].filter(
    candidate => battlegroundBaseCardId(candidate.card_id) === baseId,
  );

  return {
    normal: matchingCards.find(candidate => !isBattlegroundGoldenCardId(candidate.card_id)) || null,
    golden: matchingCards.find(candidate => isBattlegroundGoldenCardId(candidate.card_id)) || null,
  };
}

