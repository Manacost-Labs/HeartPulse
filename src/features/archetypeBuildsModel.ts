import { isStandardMetaPeriod } from '../../shared/standardMetaPeriods';
import { standardMetaPeriodLabel } from './standardMetaFilterModel';
type BuildSample = { samplePeriod: string; sampleSource?: 'stats' | 'replays' };

/**
 * A quiet note when the builds do not come from the page's own window:
 * hs-data-api (and the Bans catalog) fill archetypes without builds from the
 * whole expansion, a wider window or replays. Null when they are the page's.
 */
export function buildsWindowNote(builds: readonly BuildSample[], pagePeriod: string | null): string | null {
  if (!builds.length) return null;
  if (builds.every(build => build.sampleSource === 'replays')) return 'Сборки собраны по реплеям';
  const periods = [...new Set(builds.map(build => build.samplePeriod).filter(Boolean))];
  if (!pagePeriod || periods.length !== 1 || periods[0] === pagePeriod) return null;
  const [period] = periods;
  if (!period.startsWith('past_') && !period.startsWith('patch_') && !period.endsWith('_ban')) return 'Сборки за всё дополнение';
  return isStandardMetaPeriod(period) ? `Сборки за период «${standardMetaPeriodLabel(period)}»` : null;
}
