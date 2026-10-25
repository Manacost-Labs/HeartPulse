import { Router, type RequestHandler, type Response } from 'express';
import { createArchetypeHsguruStatsHandler, createHsguruStatsReader } from './modules/constructedArchetypes/public.js';
import type { HsguruCardRow } from './modules/constructedArchetypes/public.js';
import { loadCatalogCardMedia, withCatalogCardMedia } from './modules/constructedCards/public.js';

type Format = 'standard' | 'wild';
type RuCard = { name?: unknown; mana?: unknown } | null | undefined;

export type ArchetypeHsguruStatsRouteDependencies = {
  accessGuard: RequestHandler;
  setPrivateNoStore: (response: Response) => void;
  /** GET a hs-data-api path. */
  request: (path: string) => Promise<globalThis.Response>;
  /** The catalog the archetype pages open on; only its slugs resolve. */
  loadCatalog: (format: Format) => Promise<{ items: { slug: string; archetype: string }[] }>;
  loadRuCards: () => Promise<Record<string, RuCard>>;
  ruCardByDbf: (dbfId: number) => RuCard;
  loadCardCatalog?: (format: Format) => Promise<{ cards: Record<string, unknown>[] }>;
  onError?: (scope: 'stats' | 'media', error: unknown) => void;
};

/** Composition of the HSGuru stats section: card names and media come from the site's card data. */
export function createArchetypeHsguruStatsRouter(dependencies: ArchetypeHsguruStatsRouteDependencies): Router {
  const reader = createHsguruStatsReader({ request: dependencies.request });
  const localizeCards = async (format: Format, rows: HsguruCardRow[]) => {
    const [ruCards, media] = await Promise.all([
      dependencies.loadRuCards(),
      loadCatalogCardMedia(format, dependencies.loadCardCatalog, error => dependencies.onError?.('media', error)),
    ]);
    const localized = rows.map(row => {
      const card = (row.cardId ? ruCards[row.cardId] : null) ?? (row.dbfId === null ? null : dependencies.ruCardByDbf(row.dbfId));
      const name = typeof card?.name === 'string' && card.name.trim() ? card.name.trim() : row.cardName;
      const cost = typeof card?.mana === 'number' && Number.isFinite(card.mana) ? card.mana : null;
      return { ...row, cardName: name, cost };
    });
    return withCatalogCardMedia(localized, media);
  };
  const router = Router();
  router.get('/constructed-archetype-stats/:format/:slug', dependencies.accessGuard, createArchetypeHsguruStatsHandler({
    findArchetype: async (format, slug) => (await dependencies.loadCatalog(format)).items.find(item => item.slug === slug)?.archetype ?? null,
    read: reader.read,
    localizeCards,
    setPrivateNoStore: dependencies.setPrivateNoStore,
    onError: error => dependencies.onError?.('stats', error),
  }));
  return router;
}
