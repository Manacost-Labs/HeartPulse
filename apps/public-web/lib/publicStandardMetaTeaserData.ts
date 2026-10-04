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
 * period with its own default, while the page shows the current period. The
 * period resolved last time (`expectedPeriod`) is read alongside, so in the
 * usual case both reads run in parallel; only when the current period has
 * changed (or is not known yet) does a third read follow.
 */
export async function loadStandardMetaTeaserSeed(
  read: (path: string) => Promise<unknown>,
  expectedPeriod: StandardMetaPeriod | null = null,
): Promise<StandardMetaTeaserSeed | null> {
  const [first, expected] = await Promise.all([
    read(standardMetaTeaserPath(null)).then(teaserData),
    expectedPeriod ? read(standardMetaTeaserPath(expectedPeriod)).then(teaserData) : null,
  ]);
  if (!first) return null;
  const period = resolveStandardMetaDefaultPeriod(first.availablePeriods, first.currentPeriod, first.currentPatchPeriod)
    ?? first.period;
  if (period === first.period) return { period, data: first };
  if (expected?.period === period) return { period, data: expected };
  const current = teaserData(await read(standardMetaTeaserPath(period)));
  return current?.period === period ? { period, data: current } : null;
}
