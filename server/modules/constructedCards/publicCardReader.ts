import { isIndexableConstructedCard } from './publicCardProjection.js';
import type { ConstructedCardCollection, ConstructedCardDetailResult, ConstructedCardFormat } from './serviceContracts.js';

type Dependencies = {
  loadCards: (format: ConstructedCardFormat) => Promise<ConstructedCardCollection>;
  loadCardDetail: (format: ConstructedCardFormat, cardId: string) => Promise<ConstructedCardDetailResult | null>;
  catalogTimeoutMs?: number;
};

/** Null means authoritative absence. Stale/ambiguous membership and timeouts reject. */
export function createConstructedCardReader(dependencies: Dependencies) {
  return async (format: ConstructedCardFormat, cardId: string): Promise<Record<string, unknown> | null> => {
    const deadline = Date.now() + (dependencies.catalogTimeoutMs ?? 25_000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const collection = await dependencies.loadCards(format);
      if (!collection || !Array.isArray(collection.cards) || collection.cards.length === 0) {
        throw new Error('Invalid or empty constructed-card catalog');
      }
      const matches = collection.cards.filter(card => card.card_id === cardId);
      if (matches.length > 1) throw new Error('Ambiguous constructed-card identity');
      const card = matches[0];
      if (!card || !isIndexableConstructedCard(card)) {
        if (collection.dataStatus !== 'fresh' || collection.cacheSource !== 'fresh') {
          throw new Error('Stale catalog cannot confirm absence');
        }
        return null;
      }
      if (Date.now() >= deadline) throw new Error('Constructed-card catalog deadline exceeded');
      const detail = await dependencies.loadCardDetail(format, cardId);
      if (detail?.card && detail.card.card_id !== cardId) throw new Error('Card detail identity mismatch');
      return detail?.card && isIndexableConstructedCard(detail.card) ? detail.card : card;
    };
    try {
      return await Promise.race([
        read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Constructed-card catalog deadline exceeded')),
            Math.max(1, Math.min(25_000, dependencies.catalogTimeoutMs ?? 25_000)));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
