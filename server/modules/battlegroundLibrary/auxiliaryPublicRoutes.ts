import { Router } from 'express';
import { canonicalBattlegroundCardSlug } from './publicRoutes.js';

const KINDS = {
  anomalies: { endpoint: 'anomalies', kind: 'anomaly', typeName: 'Аномалия', archive: true },
  'dark-gifts': { endpoint: 'dark-gifts', kind: 'dark_gift', typeName: 'Темный дар', archive: false },
  quests: { endpoint: 'quests', kind: 'quest', typeName: 'Квест', archive: true },
  rewards: { endpoint: 'rewards', kind: 'reward', typeName: 'Награда', archive: true },
  'darkmoon-prizes': { endpoint: 'darkmoon-prizes', kind: 'darkmoon_prize', typeName: 'Приз Ярмарки Новолуния', archive: true },
  trinkets: { endpoint: 'trinkets', kind: 'trinket', typeName: 'Аксессуар', archive: true },
  timewarped: { endpoint: 'timewarped-cards', kind: 'timewarped', typeName: 'Хрономальная карта', archive: false },
} as const;

type Dependencies = {
  fetchImpl?: typeof fetch;
  apiBaseUrl: string;
  retryAfterSeconds: number;
  publicImageUrl: (value: unknown) => string;
  onError?: (error: unknown) => void;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function plainText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\[x\]/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maximum) : null;
}

/** Publishes only anonymous identity; paid card data stays behind the existing API. */
export function createBattlegroundLibraryAuxiliaryPublicRouter(dependencies: Dependencies): Router {
  const router = Router({ caseSensitive: true, strict: true });
  const base = new URL(dependencies.apiBaseUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
    || base.search || base.hash) throw new Error('Invalid Battleground auxiliary catalog origin');
  const retryAfter = Math.max(1, Math.min(3600, Math.floor(dependencies.retryAfterSeconds)));

  router.get('/api/bg/library/public/extra/:pool/:kind/:dbfId', async (request, response) => {
    response.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.set('X-Robots-Tag', 'noindex, nofollow');
    const { pool, kind, dbfId } = request.params;
    const spec = Object.hasOwn(KINDS, kind) ? KINDS[kind as keyof typeof KINDS] : null;
    if (!spec || (pool !== 'current' && pool !== 'archive')
      || (pool === 'archive' && !spec.archive)
      || !/^[1-9][0-9]*$/.test(dbfId) || !Number.isSafeInteger(Number(dbfId))) {
      return response.status(404).json({ error: 'Card not found' });
    }

    try {
      const upstream = new URL(`${base.pathname.replace(/\/$/, '')}/${spec.endpoint}`, base.origin);
      upstream.searchParams.set('dbf', dbfId);
      upstream.searchParams.set('per_page', '1');
      if (spec.archive) upstream.searchParams.set('in_pool', pool === 'current' ? '1' : '0');
      const result = await (dependencies.fetchImpl ?? fetch)(upstream, {
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
      });
      if (!result.ok) throw new Error(`Battleground auxiliary catalog HTTP ${result.status}`);
      const payload = record(await result.json());
      if (!Array.isArray(payload.data) || payload.data.length > 1) {
        throw new Error('Invalid Battleground auxiliary catalog response');
      }
      if (payload.data.length === 0) return response.status(404).json({ error: 'Card not found' });
      const card = record(payload.data[0]);
      if (card.dbf !== Number(dbfId)) throw new Error('Battleground auxiliary catalog identity mismatch');
      if (spec.archive && card.in_pool !== (pool === 'current')) {
        return response.status(404).json({ error: 'Card not found' });
      }
      const nameValue = record(card.name).ru ?? card.name;
      const name = plainText(nameValue, 180);
      if (!name) throw new Error('Missing Battleground auxiliary card name');
      const text = plainText(record(card.text).ru ?? card.text_ru, 500);
      const images = record(card.images);
      const image = dependencies.publicImageUrl(images.card ?? images.framed ?? images.crop);
      const prefix = pool === 'archive' ? '/library/archive' : '/library';
      return response.json({
        card: { dbfId: Number(dbfId), kind: spec.kind, nameRu: name,
          typeName: spec.typeName, textRu: text, images: { card: image } },
        canonicalPath: `${prefix}/${kind}/${canonicalBattlegroundCardSlug(name)}-${dbfId}/`,
      });
    } catch (error) {
      try { dependencies.onError?.(error); } catch { /* Diagnostics cannot replace the retryable response. */ }
      response.set('Retry-After', String(retryAfter));
      return response.status(503).json({ error: 'Card catalog temporarily unavailable' });
    }
  });
  return router;
}
