import {
  parseStandardMetaApiResponse,
  type StandardMetaData,
  type StandardMetaPeriod,
} from '@/shared/standardMetaContract';
import type { StandardMetaTeaserSeed } from '@/src/features/standardMetaTeaser';
import { resolveStandardMetaDefaultPeriod } from '@/src/features/standardMetaFilterModel';

/** The guest's first view: the filters StandardMeta starts with. */
export function standardMetaTeaserPath(period: StandardMetaPeriod | null): string {
  const params = new URLSearchParams({ format: 'standard', rank: 'diamond_legend', coin: 'any_player', min_games: '100' });
  if (period) params.set('period', period);
  return `/api/standard-meta/teaser?${params}`;
}

// The teaser is the anonymous top three; anything longer is not a teaser.
const TEASER_ITEMS = 3;

function teaserData(raw: unknown): StandardMetaData | null {
  if (raw === null || raw === undefined) return null;
  try {
    const { data } = parseStandardMetaApiResponse(raw);
    return data.items.length <= TEASER_ITEMS ? data : null;
  } catch {
    return null;
  }
}

/**
 * Loads the slice a guest sees first. Express answers a request without a
 * period with its own default, while the page shows the current period, so
 * a second read is made only when the two differ, as the page itself would.
 */
export async function loadStandardMetaTeaserSeed(
  read: (path: string) => Promise<unknown>,
): Promise<StandardMetaTeaserSeed | null> {
  const first = teaserData(await read(standardMetaTeaserPath(null)));
  if (!first) return null;
  const period = resolveStandardMetaDefaultPeriod(first.availablePeriods, first.currentPeriod, first.currentPatchPeriod)
    ?? first.period;
  if (period === first.period) return { period, data: first };
  const current = teaserData(await read(standardMetaTeaserPath(period)));
  return current?.period === period ? { period, data: current } : null;
}
