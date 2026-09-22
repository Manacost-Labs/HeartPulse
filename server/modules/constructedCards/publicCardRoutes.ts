import { Router } from 'express';
import type { PublicConstructedCardSeoData } from './publicCardProjection.js';
import type { createConstructedCardReader } from './publicCardReader.js';

export function createPublicCardRouter(read: ReturnType<typeof createConstructedCardReader>, project: (card: Record<string, unknown>) => PublicConstructedCardSeoData): Router {
  const router = Router({ caseSensitive: true });
  router.get('/api/public/constructed-cards/:format/:cardId', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    const { format, cardId } = request.params;
    if ((format !== 'standard' && format !== 'wild') || !/^(?:[A-Za-z0-9_]{2,80}|blizzard:[1-9][0-9]{0,18})$/.test(cardId)) {
      return response.status(404).json({ error: 'Card not found' });
    }
    try {
      const card = await read(format, cardId);
      if (!card) return response.status(404).json({ error: 'Card not found' });
      return response.json({
        card: project(card),
        classCode: typeof card.class === 'string' && /^[A-Z]+$/.test(card.class) ? card.class : 'NEUTRAL',
        dbf: Number.isSafeInteger(card.dbf) && Number(card.dbf) > 0 ? card.dbf : null,
      });
    } catch {
      response.set('Retry-After', '30');
      return response.status(503).json({ error: 'Card catalog temporarily unavailable' });
    }
  });
  return router;
}
