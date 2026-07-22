import { Router, type RequestHandler } from 'express';
import type { StandardMetaClassKey } from './standardMetaClasses.js';
import type { DeckCardData } from './deckCardData.js';
import { createStandardMetaEnvelope } from './standardMetaDataset.js';
import { STANDARD_META_MEDIA_TYPE } from '../shared/standardMetaContract.js';

export type StandardMetaFormat = 'standard' | 'wild';
export type StandardMetaRank = 'all' | 'legend' | 'diamond' | 'top_5k' | 'top_legend';
export type StandardMetaPeriod = 'past_6_hours' | 'past_day' | 'past_3_days' | 'past_week' | 'past_2_weeks';
export type StandardMetaCoin = 'any_player';
export type StandardMetaMinGames = 100 | 250 | 500 | 1000 | 2500 | 5000;

export type StandardMetaRecommendation = {
  archetype: string;
  archetypeLabel: string;
  deckCode: string;
  format: StandardMetaFormat;
  rank: StandardMetaRank;
  source: string;
  sourceUrl: string;
  streamer: string | null;
  sampleGames: number | null;
  winrate: number | null;
  updatedAt: string | null;
  classKey: StandardMetaClassKey;
  matchedArchetype: string;
  matchMethod: 'exact' | 'alias';
  deckCards?: DeckCardData[];
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
  accessGuard: RequestHandler;
  loadMeta: (
    format: StandardMetaFormat,
    rank: StandardMetaRank,
    period: StandardMetaPeriod,
    coin: StandardMetaCoin,
    minGames: StandardMetaMinGames,
  ) => Promise<unknown>;
  loadViciousGold: () => Promise<unknown>;
  findRecommendation: (
    archetype: string,
    archetypeLabel: string,
    format: StandardMetaFormat,
    rank: StandardMetaRank,
  ) => Promise<StandardMetaRecommendation | null>;
  createPreview: (recommendation: StandardMetaRecommendation) => Promise<StandardMetaPreview>;
  getPreview: (hash: string) => Promise<StandardMetaPreview>;
  setPrivateNoStore: (response: import('express').Response) => void;
  onError?: (scope: 'meta' | 'vicious-gold' | 'recommendation' | 'preview-create' | 'preview-read', error: unknown) => void;
};

const FORMATS = new Set<StandardMetaFormat>(['standard', 'wild']);
const RANKS = new Set<StandardMetaRank>(['all', 'legend', 'diamond', 'top_5k', 'top_legend']);
const PERIODS = new Set<StandardMetaPeriod>(['past_6_hours', 'past_day', 'past_3_days', 'past_week', 'past_2_weeks']);
const COINS = new Set<StandardMetaCoin>(['any_player']);
const MIN_GAMES = new Set<StandardMetaMinGames>([100, 250, 500, 1000, 2500, 5000]);

function readFormat(value: unknown): StandardMetaFormat | null {
  const format = String(value ?? 'standard') as StandardMetaFormat;
  return FORMATS.has(format) ? format : null;
}

function readRank(value: unknown): StandardMetaRank | null {
  const rank = String(value ?? 'all') as StandardMetaRank;
  return RANKS.has(rank) ? rank : null;
}

function readPeriod(value: unknown): StandardMetaPeriod | null {
  const period = String(value ?? 'past_day') as StandardMetaPeriod;
  return PERIODS.has(period) ? period : null;
}

function readCoin(value: unknown): StandardMetaCoin | null {
  const coin = String(value ?? 'any_player') as StandardMetaCoin;
  return COINS.has(coin) ? coin : null;
}

function readMinGames(value: unknown): StandardMetaMinGames | null {
  const minGames = Number(value ?? 100) as StandardMetaMinGames;
  return MIN_GAMES.has(minGames) ? minGames : null;
}

function readArchetype(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
}

function message(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'DECKVIEW_TIMEOUT') return 'DeckView отвечает слишком долго. Попробуйте ещё раз';
  if (code === 'DECKVIEW_PREVIEW_NOT_FOUND') return 'Изображение DeckView устарело. Откройте колоду заново';
  if (code === 'DECKVIEW_RENDER_FAILED') return 'DeckView не смог создать изображение колоды';
  return fallback;
}

function acceptsMediaType(value: unknown, mediaType: string): boolean {
  return String(value ?? '')
    .split(',')
    .map(part => part.trim())
    .some(part => {
      const [type, ...parameters] = part.split(';').map(token => token.trim().toLowerCase());
      if (type !== mediaType) return false;
      const quality = parameters.find(parameter => parameter.startsWith('q='));
      if (!quality) return true;
      const parsed = Number(quality.slice(2));
      return Number.isFinite(parsed) && parsed > 0;
    });
}

export function createStandardMetaRouter(dependencies: StandardMetaRouterDependencies): Router {
  const router = Router();

  const protectAdminStats: RequestHandler = (_request, response, next) => {
    dependencies.setPrivateNoStore(response);
    next();
  };
  router.use('/standard-meta', dependencies.accessGuard, protectAdminStats);
  router.use('/vicious-syndicate-gold', dependencies.accessGuard, protectAdminStats);
  router.use('/admin/standard-meta', dependencies.adminGuard, protectAdminStats);
  router.use('/admin/vicious-syndicate-gold', dependencies.adminGuard, protectAdminStats);

  const metaHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format);
    const rank = readRank(request.query.rank);
    const period = readPeriod(request.query.period);
    const coin = readCoin(request.query.coin);
    const minGames = readMinGames(request.query.min_games);
    if (!format || !rank || !period || !coin || !minGames) {
      return response.status(400).json({ error: 'Неизвестный фильтр меты' });
    }
    try {
      const envelope = createStandardMetaEnvelope(
        await dependencies.loadMeta(format, rank, period, coin, minGames),
      );
      response.vary('Accept');
      response.set('X-Dataset-Schema', String(envelope.schemaVersion));
      response.set('X-Dataset-Version', envelope.datasetVersion);
      const acceptsVersionedEnvelope = acceptsMediaType(request.headers.accept, STANDARD_META_MEDIA_TYPE);
      response.type(acceptsVersionedEnvelope ? STANDARD_META_MEDIA_TYPE : 'application/json');
      return response.json(acceptsVersionedEnvelope ? envelope : envelope.data);
    } catch (error) {
      dependencies.onError?.('meta', error);
      return response.status(502).json({ error: 'Данные меты временно недоступны' });
    }
  };
  router.get('/standard-meta', metaHandler);
  router.get('/admin/standard-meta', metaHandler);

  const viciousHandler: RequestHandler = async (_request, response) => {
    try {
      return response.json(await dependencies.loadViciousGold());
    } catch (error) {
      dependencies.onError?.('vicious-gold', error);
      return response.status(502).json({ error: 'Данные Vicious Syndicate временно недоступны' });
    }
  };
  router.get('/vicious-syndicate-gold', viciousHandler);
  router.get('/admin/vicious-syndicate-gold', viciousHandler);

  const recommendationHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.query.format);
    const rank = readRank(request.query.rank);
    const archetype = readArchetype(request.query.archetype);
    const archetypeLabel = readArchetype(request.query.archetypeLabel) || archetype;
    if (!format || !rank || !archetype) return response.status(400).json({ error: 'Не указан архетип, формат или рейтинг' });
    try {
      const recommendation = await dependencies.findRecommendation(archetype, archetypeLabel, format, rank);
      if (!recommendation) return response.status(404).json({ error: 'Для этого архетипа пока не найден точный список' });
      return response.json({ recommendation });
    } catch (error) {
      dependencies.onError?.('recommendation', error);
      return response.status(502).json({ error: 'Не удалось подобрать сборку' });
    }
  };
  router.get('/standard-meta/recommendation', recommendationHandler);
  router.get('/admin/standard-meta/recommendation', recommendationHandler);

  const previewCreateHandler: RequestHandler = async (request, response) => {
    const format = readFormat(request.body?.format);
    const rank = readRank(request.body?.rank);
    const archetype = readArchetype(request.body?.archetype);
    const archetypeLabel = readArchetype(request.body?.archetypeLabel) || archetype;
    if (!format || !rank || !archetype) return response.status(400).json({ error: 'Не указан архетип, формат или рейтинг' });
    try {
      // The deck code is deliberately resolved again on the server. Clients cannot
      // use this admin endpoint as an arbitrary DeckView rendering proxy.
      const recommendation = await dependencies.findRecommendation(archetype, archetypeLabel, format, rank);
      if (!recommendation) return response.status(404).json({ error: 'Для этого архетипа пока не найден точный список' });
      const preview = await dependencies.createPreview(recommendation);
      return response.status(preview.ready ? 200 : 202).json({ recommendation, preview });
    } catch (error) {
      dependencies.onError?.('preview-create', error);
      return response.status(502).json({ error: message(error, 'Не удалось создать изображение колоды') });
    }
  };
  router.post('/standard-meta/preview', previewCreateHandler);
  router.post('/admin/standard-meta/preview', previewCreateHandler);

  const previewReadHandler: RequestHandler = async (request, response) => {
    const hash = String(request.params.hash ?? '').trim();
    if (!/^[a-zA-Z0-9_-]{8,96}$/.test(hash)) return response.status(400).json({ error: 'Некорректный ID изображения' });
    try {
      return response.json({ preview: await dependencies.getPreview(hash) });
    } catch (error) {
      dependencies.onError?.('preview-read', error);
      return response.status(502).json({ error: message(error, 'Не удалось получить изображение колоды') });
    }
  };
  router.get('/standard-meta/preview/:hash', previewReadHandler);
  router.get('/admin/standard-meta/preview/:hash', previewReadHandler);

  return router;
}
