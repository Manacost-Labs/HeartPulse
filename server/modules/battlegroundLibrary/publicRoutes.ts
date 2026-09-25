import { Router, type RequestHandler } from 'express';

type Kind = 'minion' | 'spell';
type PublicCard = { dbfId: number; kind: Kind; nameRu: string; inPool: boolean };

type Dependencies<Card extends PublicCard> = {
  loadCatalog: (kind: Kind) => Promise<Card[]>;
  retryAfterSeconds: number;
  onError?: (error: unknown) => void;
};

export function canonicalBattlegroundCardSlug(value: string): string {
  return String(value).toLowerCase().replace(/ё/g, 'е').trim()
    .replace(/['’]/g, '').replace(/[^a-zа-я0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'card';
}

/** Publishes the existing anonymous catalog projection for Next detail HTML. */
export function createBattlegroundLibraryPublicRouter<Card extends PublicCard>(dependencies: Dependencies<Card>): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const serve = (archive: boolean): RequestHandler => async (request, response) => {
    const { kind, dbfId } = request.params;
    const id = Number(dbfId);
    response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.set('X-Robots-Tag', 'noindex, nofollow');
    if ((kind !== 'minion' && kind !== 'spell')
      || !/^[1-9][0-9]*$/.test(dbfId) || !Number.isSafeInteger(id)) {
      return response.status(404).json({ error: 'Card not found' });
    }
    try {
      const card = (await dependencies.loadCatalog(kind)).find(candidate =>
        candidate.dbfId === id && (!archive || !candidate.inPool));
      if (!card) return response.status(404).json({ error: 'Card not found' });
      const kindPath = kind === 'minion' ? 'minions' : 'spells';
      const prefix = archive ? '/library/archive' : '/library';
      const canonicalPath = `${prefix}/${kindPath}/${canonicalBattlegroundCardSlug(card.nameRu)}-${id}/`;
      return response.json({ card, canonicalPath });
    } catch (error) {
      try { dependencies.onError?.(error); } catch { /* Diagnostics cannot replace the retryable response. */ }
      response.set('Retry-After', String(dependencies.retryAfterSeconds));
      return response.status(503).json({ error: 'Card catalog temporarily unavailable' });
    }
  };
  router.get('/api/bg/library/public/:kind/:dbfId', serve(false));
  router.get('/api/bg/library/public/archive/:kind/:dbfId', serve(true));
  return router;
}
