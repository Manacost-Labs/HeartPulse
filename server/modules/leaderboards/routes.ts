import { Router, type Request, type Response } from 'express';
import { isLeaderboardMode, isLeaderboardRegion, type LeaderboardRegion } from './contract.js';
import type { BoardQuery, LeaderboardsService } from './service.js';

export type LeaderboardsRouterDependencies = {
  service: LeaderboardsService;
  onError?: (error: unknown) => void;
};

// Снимки обновляются раз в шесть часов; минута кеша — компромисс между свежестью и нагрузкой.
const PUBLIC_CACHE = 'public, max-age=60, stale-while-revalidate=300';
// 2000 страниц Blizzard по 25 строк — до 50 000 мест, это 1000 страниц сайта по 50.
const MAX_PAGE = 1000;

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'string' || !/^\d{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : null;
}

function boardQuery(request: Request): BoardQuery | null {
  const mode = request.query.mode ?? 'standard';
  const region = request.query.region ?? 'EU';
  const rawSeason = request.query.season;
  const season = rawSeason === undefined || rawSeason === '' ? null : wholeNumber(rawSeason, 0, 100_000);
  if (!isLeaderboardMode(mode) || !isLeaderboardRegion(region) || (rawSeason !== undefined && rawSeason !== '' && season === null)) return null;
  return { mode, region, season };
}

/** Публичные официальные таблицы лидеров Blizzard: только данные hs-data-api, без данных зрителя. */
export function createLeaderboardsRouter({ service, onError }: LeaderboardsRouterDependencies): Router {
  const router = Router();

  const send = async (response: Response, load: () => Promise<unknown>, missing: string) => {
    let value: unknown;
    try {
      value = await load();
    } catch (error) {
      onError?.(error);
      response.set('Cache-Control', 'no-store');
      response.status(502).json({ error: 'Таблицы лидеров временно недоступны' });
      return;
    }
    if (value === null) {
      response.set('Cache-Control', PUBLIC_CACHE);
      response.status(404).json({ error: missing });
      return;
    }
    response.set('Cache-Control', PUBLIC_CACHE);
    response.json(value);
  };
  const invalid = (response: Response) => {
    response.set('Cache-Control', 'no-store');
    response.status(400).json({ error: 'Неверные параметры таблицы' });
  };

  router.get('/leaderboards/seasons', (_request, response) => send(response, () => service.seasons(), 'Таблицы ещё не собраны'));

  router.get('/leaderboards/table', (request, response) => {
    const board = boardQuery(request);
    const page = request.query.page === undefined ? 1 : wholeNumber(request.query.page, 1, MAX_PAGE);
    const rawQuery = request.query.q;
    const query = rawQuery === undefined || rawQuery === '' ? null : text(rawQuery, 32);
    if (!board || page === null || (rawQuery !== undefined && rawQuery !== '' && query === null)) return invalid(response);
    return send(response, () => service.table({ ...board, page, query }), 'Эта таблица ещё не собрана');
  });

  router.get('/leaderboards/stats', (request, response) => {
    const board = boardQuery(request);
    if (!board) return invalid(response);
    return send(response, () => service.stats(board), 'Эта таблица ещё не собрана');
  });

  router.get('/leaderboards/player', (request, response) => {
    const region = request.query.region ?? 'EU';
    const name = text(request.query.name, 64);
    if (!isLeaderboardRegion(region) || !name) return invalid(response);
    return send(response, () => service.player(region, name), 'Игрока нет в сохранённых таблицах');
  });

  router.get('/leaderboards/players', (request, response) => {
    const rawRegion = request.query.region;
    const query = text(request.query.q, 32);
    const region: LeaderboardRegion | null = isLeaderboardRegion(rawRegion) ? rawRegion : null;
    if (!query || query.length < 2 || (rawRegion !== undefined && rawRegion !== '' && !region)) return invalid(response);
    return send(response, () => service.players(query, region), 'Игроки не найдены');
  });

  return router;
}
