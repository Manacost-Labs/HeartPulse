import { Router, type RequestHandler } from 'express';
import type { StandardMetaClassKey } from './standardMetaClasses.js';

export type StandardMetaFormat = 'standard' | 'wild';
export type StandardMetaRank = 'legend' | 'diamond' | 'top_5k' | 'top_legend';

export type StandardMetaRecommendation = {
  archetype: string;
  archetypeLabel: string;
  deckCode: string;
  format: StandardMetaFormat;
  source: string;
  sourceUrl: string;
  streamer: string | null;
  sampleGames: number | null;
  winrate: number | null;
  updatedAt: string | null;
  classKey: StandardMetaClassKey;
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias' | 'representative';
};

export type StandardMetaPreview = {
  hash: string;
  state: string;
  ready: boolean;
  imageUrl: string | null;
  error: string | null;
};

export type StandardMetaRouterDependencies = {
  adminGuard: RequestHandler;
  loadMeta: (format: StandardMetaFormat, rank: StandardMetaRank) => Promise<unknown>;
  loadViciousGold: () => Promise<unknown>;
  findRecommendation: (
    archetype: string,
    archetypeLabel: string,
    format: StandardMetaFormat,
  ) => Promise<StandardMetaRecommendation | null>;
  createPreview: (recommendation: StandardMetaRecommendation) => Promise<StandardMetaPreview>;
  getPreview: (hash: string) => Promise<StandardMetaPreview>;
  setPrivateNoStore: (response: import('express').Response) => void;
  onError?: (scope: 'meta' | 'vicious-gold' | 'recommendation' | 'preview-create' | 'preview-read', error: unknown) => void;
};

const FORMATS = new Set<StandardMetaFormat>(['standard', 'wild']);
const RANKS = new Set<StandardMetaRank>(['legend', 'diamond', 'top_5k', 'top_legend']);

function readFormat(value: unknown): StandardMetaFormat | null {
  const format = String(value ?? 'standard') as StandardMetaFormat;
  return FORMATS.has(format) ? format : null;
}

function readRank(value: unknown): StandardMetaRank | null {
  const rank = String(value ?? 'legend') as StandardMetaRank;
  return RANKS.has(rank) ? rank : null;
}

function readArchetype(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function message(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'KOLODAHS_NOT_CONFIGURED') return 'Рендер колоды пока не настроен на сервере';
  if (code === 'KOLODAHS_TIMEOUT') return 'KolodaHS отвечает слишком долго. Попробуйте ещё раз';
  return fallback;
}

export function createStandardMetaRouter(dependencies: StandardMetaRouterDependencies): Router {
  const router = Router();

  const protectAdminStats: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  router.use('/admin/standard-meta', dependencies.adminGuard, protectAdminStats);
  router.use('/admin/vicious-syndicate-gold', dependencies.adminGuard, protectAdminStats);

  router.get('/admin/standard-meta', async (request, response) => {
    const format = readFormat(request.query.format);
    const rank = readRank(request.query.rank);
    if (!format || !rank) return response.status(400).json({ error: 'Неизвестный формат или рейтинг' });
    try {
      return response.json(await dependencies.loadMeta(format, rank));
    } catch (error) {
      dependencies.onError?.('meta', error);
      return response.status(502).json({ error: 'Данные меты временно недоступны' });
    }
  });

  router.get('/admin/vicious-syndicate-gold', async (_request, response) => {
    try {
      return response.json(await dependencies.loadViciousGold());
    } catch (error) {
      dependencies.onError?.('vicious-gold', error);
      return response.status(502).json({ error: 'Данные Vicious Syndicate временно недоступны' });
    }
  });

  router.get('/admin/standard-meta/recommendation', async (request, response) => {
    const format = readFormat(request.query.format);
    const archetype = readArchetype(request.query.archetype);
    const archetypeLabel = readArchetype(request.query.archetypeLabel) || archetype;
    if (!format || !archetype) return response.status(400).json({ error: 'Не указан архетип или формат' });
    try {
      const recommendation = await dependencies.findRecommendation(archetype, archetypeLabel, format);
      if (!recommendation) return response.status(404).json({ error: 'Для этого архетипа пока нет подходящей сборки' });
      return response.json({ recommendation });
    } catch (error) {
      dependencies.onError?.('recommendation', error);
      return response.status(502).json({ error: 'Не удалось подобрать сборку' });
    }
  });

  router.post('/admin/standard-meta/preview', async (request, response) => {
    const format = readFormat(request.body?.format);
    const archetype = readArchetype(request.body?.archetype);
    const archetypeLabel = readArchetype(request.body?.archetypeLabel) || archetype;
    if (!format || !archetype) return response.status(400).json({ error: 'Не указан архетип или формат' });
    try {
      // The deck code is deliberately resolved again on the server. Clients cannot
      // use this admin endpoint as an arbitrary KolodaHS rendering proxy.
      const recommendation = await dependencies.findRecommendation(archetype, archetypeLabel, format);
      if (!recommendation) return response.status(404).json({ error: 'Для этого архетипа пока нет подходящей сборки' });
      const preview = await dependencies.createPreview(recommendation);
      return response.status(preview.ready ? 200 : 202).json({ recommendation, preview });
    } catch (error) {
      dependencies.onError?.('preview-create', error);
      return response.status(502).json({ error: message(error, 'Не удалось создать изображение колоды') });
    }
  });

  router.get('/admin/standard-meta/preview/:hash', async (request, response) => {
    const hash = String(request.params.hash ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{8,96}$/.test(hash)) return response.status(400).json({ error: 'Некорректный ID изображения' });
    try {
      return response.json({ preview: await dependencies.getPreview(hash) });
    } catch (error) {
      dependencies.onError?.('preview-read', error);
      return response.status(502).json({ error: message(error, 'Не удалось получить изображение колоды') });
    }
  });

  return router;
}
