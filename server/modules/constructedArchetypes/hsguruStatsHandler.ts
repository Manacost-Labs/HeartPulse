import type { RequestHandler, Response } from 'express';
import { readHsguruStatSlice, type ArchetypeHsguruStats, type HsguruCardRow, type HsguruStatSlice } from './hsguruStats.js';

type Format = 'standard' | 'wild';

export type ArchetypeHsguruStatsHandlerDependencies<Card> = {
  /** The archetype's HSGuru name for a page slug, or null when the current catalog has none. */
  findArchetype: (format: Format, slug: string) => Promise<string | null>;
  read: (format: Format, archetype: string, slice: HsguruStatSlice | null) => Promise<ArchetypeHsguruStats>;
  /** Russian names, mana and card media for the card rows. */
  localizeCards: (format: Format, rows: HsguruCardRow[]) => Promise<Card[]>;
  setPrivateNoStore: (response: Response) => void;
  onError?: (error: unknown) => void;
};

const SLICE_FIELDS = ['rank', 'period', 'coin', 'opponent'];

/**
 * `GET /api/constructed-archetype-stats/:format/:slug` — subscriber data:
 * mount after the entitlement guard. Without slice parameters it opens the
 * best collected slice; a slice that is not collected yet answers 200 with
 * `mulligan: null`, so the page can show its empty state.
 */
export function createArchetypeHsguruStatsHandler<Card>(dependencies: ArchetypeHsguruStatsHandlerDependencies<Card>): RequestHandler {
  return async (request, response) => {
    dependencies.setPrivateNoStore(response);
    const format = request.params.format;
    const slug = String(request.params.slug ?? '').trim().toLowerCase();
    if ((format !== 'standard' && format !== 'wild') || !/^[a-z0-9-]{1,90}$/.test(slug)) {
      response.status(400).json({ error: 'Некорректный адрес архетипа' }); return;
    }
    const query = request.query as Record<string, unknown>;
    const named = SLICE_FIELDS.some(field => query[field] !== undefined);
    const slice = named ? readHsguruStatSlice(query) : null;
    if (named && !slice) { response.status(400).json({ error: 'Неизвестный срез статистики' }); return; }
    try {
      const archetype = await dependencies.findArchetype(format, slug);
      if (!archetype) { response.status(404).json({ error: 'Архетип не найден в текущей мете' }); return; }
      const stats = await dependencies.read(format, archetype, slice);
      const mulligan = stats.mulligan
        ? { ...stats.mulligan, rows: await dependencies.localizeCards(format, stats.mulligan.rows) }
        : null;
      response.json({ ...stats, mulligan });
    } catch (error) {
      dependencies.onError?.(error);
      response.status(502).json({ error: 'Статистика HSGuru временно недоступна' });
    }
  };
}
