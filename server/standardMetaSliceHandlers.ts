import type { RequestHandler } from 'express';
import { createStandardMetaEnvelope } from './standardMetaDataset.js';
import { STANDARD_META_ROLLING_PERIODS } from '../shared/standardMetaPeriods.js';
import { buildStandardMetaTrends } from './standardMetaTrends.js';
import {
  readStandardMetaSliceQuery,
  type StandardMetaCoin,
  type StandardMetaFormat,
  type StandardMetaMinGames,
  type StandardMetaPeriod,
  type StandardMetaRank,
} from './standardMetaQuery.js';

/** What the slice handlers need from the meta router's dependencies. */
type SliceSource = {
  loadMeta: (format: StandardMetaFormat, rank: StandardMetaRank, period: StandardMetaPeriod,
    coin: StandardMetaCoin, minGames: StandardMetaMinGames) => Promise<unknown>;
  onError?: (scope: 'meta' | 'meta-trends', error: unknown) => void;
};

/** The public three-row teaser of a slice: cacheable, the same for every viewer. */
export function createTeaserHandler(dependencies: SliceSource): RequestHandler {
  return async (request, response) => {
    const slice = readStandardMetaSliceQuery(request.query);
    if (!slice) return response.status(400).json({ error: 'Неизвестный фильтр меты' });
    const { format, rank, period, coin, minGames } = slice;
    try {
      const envelope = createStandardMetaEnvelope(
        await dependencies.loadMeta(format, rank, period, coin, minGames),
      );
      response.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');
      response.set('X-Content-Type-Options', 'nosniff');
      // The sample is the games of every row of the slice, not of the three shown.
      return response.json({
        ...envelope.data,
        totalGames: envelope.quality.sampleSize ?? undefined,
        items: envelope.data.items.slice(0, 3),
      });
    } catch (error) {
      dependencies.onError?.('meta', error);
      return response.status(502).json({ error: 'Данные меты временно недоступны' });
    }
  };
}

/**
 * Trends are cut from the rolling windows of the same slice, read at the
 * source's lowest game floor (see buildStandardMetaTrends); a window that
 * fails to load only blanks the trend points that need it.
 */
export function createTrendsHandler(dependencies: SliceSource): RequestHandler {
  return async (request, response) => {
    const slice = readStandardMetaSliceQuery(request.query);
    if (!slice) return response.status(400).json({ error: 'Неизвестный фильтр меты' });
    const { format, rank, period, coin, minGames } = slice;
    const loadSlice = async (slicePeriod: StandardMetaPeriod, floor: StandardMetaMinGames) => (
      createStandardMetaEnvelope(await dependencies.loadMeta(format, rank, slicePeriod, coin, floor)).data
    );
    try {
      const [selected, ...ladder] = await Promise.all([
        loadSlice(period, minGames),
        ...STANDARD_META_ROLLING_PERIODS.map(slicePeriod => loadSlice(slicePeriod, 100).catch(error => {
          dependencies.onError?.('meta-trends', error);
          return null;
        })),
      ]);
      return response.json(buildStandardMetaTrends({ selected, ladder, minGames }));
    } catch (error) {
      dependencies.onError?.('meta-trends', error);
      return response.status(502).json({ error: 'Динамика меты временно недоступна' });
    }
  };
}

