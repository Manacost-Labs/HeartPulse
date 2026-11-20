import type { RequestHandler } from 'express';
import { createStandardMetaEnvelope } from './standardMetaDataset.js';
import { latestStandardMetaBanPeriod } from '../shared/standardMetaPeriods.js';
import {
  readFormat,
  type StandardMetaCoin,
  type StandardMetaFormat,
  type StandardMetaMinGames,
  type StandardMetaPeriod,
  type StandardMetaRank,
} from './standardMetaQuery.js';

/** The general slice every guest sees: the filters the meta page opens with (src/features/standardMetaTeaser.ts). */
export const PUBLIC_STANDARD_META_SLICE = { rank: 'diamond_legend', coin: 'any_player', minGames: 100 } as const;

type PublicSource = {
  loadMeta: (format: StandardMetaFormat, rank: StandardMetaRank, period: StandardMetaPeriod,
    coin: StandardMetaCoin, minGames: StandardMetaMinGames) => Promise<unknown>;
  onError?: (scope: 'meta', error: unknown) => void;
};

/** One archetype row of the open slice: the paid columns (turns, duration, climb speed) are not copied. */
export type PublicStandardMetaItem = {
  id: string; slug: string; archetype: string; archetypeLabel: string; translated: boolean;
  classKey: string | null; winrate: number | null; popularity: number | null; games: number | null;
  turns: null; durationMinutes: null; climbingSpeed: null;
};

/**
 * Field-by-field allowlist of the open meta slice. Anything a source adds later
 * stays out of the guest's answer until it is named here.
 */
export function projectPublicStandardMeta(data: ReturnType<typeof createStandardMetaEnvelope>['data'], totalGames: number | null) {
  return {
    format: data.format,
    formatLabel: data.formatLabel,
    rank: data.rank,
    rankLabel: data.rankLabel,
    period: data.period,
    availablePeriods: [data.period],
    currentPeriod: data.currentPeriod === data.period ? data.period : null,
    currentPatchPeriod: data.currentPatchPeriod === data.period ? data.period : null,
    coin: data.coin,
    minGames: data.minGames,
    source: data.source,
    sourceUrl: data.sourceUrl,
    translationSource: data.translationSource,
    updatedAt: data.updatedAt,
    ...(totalGames === null ? {} : { totalGames }),
    items: data.items.map((item): PublicStandardMetaItem => ({
      id: item.id,
      slug: item.slug,
      archetype: item.archetype,
      archetypeLabel: item.archetypeLabel,
      translated: item.translated,
      classKey: item.classKey,
      winrate: item.winrate,
      popularity: item.popularity,
      games: item.games,
      turns: null,
      durationMinutes: null,
      climbingSpeed: null,
    })),
  };
}

/**
 * The open general slice of a format, as a guest gets it: the server picks rank,
 * coin, floor and the period the page opens with (current patch, then the Bans
 * window, then the current window). Rejects when the source fails.
 */
export async function loadPublicStandardMeta(loadMeta: PublicSource['loadMeta'], format: StandardMetaFormat) {
  const { rank, coin, minGames } = PUBLIC_STANDARD_META_SLICE;
  const first = createStandardMetaEnvelope(await loadMeta(format, rank, 'past_day', coin, minGames));
  const { availablePeriods, currentPeriod, currentPatchPeriod } = first.data;
  const period = [currentPatchPeriod, latestStandardMetaBanPeriod(availablePeriods, currentPeriod), currentPeriod]
    .find((candidate): candidate is StandardMetaPeriod => Boolean(candidate && availablePeriods.includes(candidate)))
    ?? first.data.period;
  const envelope = period === first.data.period
    ? first
    : createStandardMetaEnvelope(await loadMeta(format, rank, period, coin, minGames));
  return projectPublicStandardMeta(envelope.data, envelope.quality.sampleSize ?? null);
}

/**
 * The open general slice of a format: archetype, class, winrate, popularity and
 * games of every row. The list of other periods is not sent. One answer for every
 * viewer, so it may sit in a shared cache.
 */
export function createPublicStandardMetaHandler(dependencies: PublicSource): RequestHandler {
  // The last good slice of each format: a source failure answers it before it answers an error.
  const lastGood = new Map<StandardMetaFormat, ReturnType<typeof projectPublicStandardMeta>>();
  return async (request, response) => {
    const format = readFormat(request.query.format);
    if (!format) return response.status(400).json({ error: 'Неизвестный формат' });
    try {
      const body = await loadPublicStandardMeta(dependencies.loadMeta, format);
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      response.set('X-Content-Type-Options', 'nosniff');
      lastGood.set(format, body);
      return response.json(body);
    } catch (error) {
      dependencies.onError?.('meta', error);
      // A prerender read is cached by Next for minutes: it gets no last-good copy (the page keeps its earlier one).
      const stale = request.get('X-Hearthpulse-Prerender') ? undefined : lastGood.get(format);
      response.set('X-Content-Type-Options', 'nosniff');
      if (stale) {
        // The last good slice stays a short-lived shared answer: it is data, but not fresh.
        response.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=60');
        response.set('X-Standard-Meta-Source', 'stale');
        return response.json(stale);
      }
      // An error never sits in a shared cache; callers retry after a minute.
      response.set('Cache-Control', 'no-store');
      response.set('Retry-After', '60');
      return response.status(503).json({ error: 'Данные меты временно недоступны' });
    }
  };
}
