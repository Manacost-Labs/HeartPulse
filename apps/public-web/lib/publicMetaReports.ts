import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { isMetaReportDate, readMetaReportDates, readMetaReportSnapshot, type MetaReportSnapshot } from './publicMetaReportData';

/**
 * Snapshot dates on record, newest first. An empty archive is `[]`; an
 * unreadable answer throws, so the page fails instead of claiming no reports.
 */
export const loadMetaReportDates = cache(async (): Promise<string[]> => {
  const response = await fetchPublicExpress('/api/meta-reports');
  if (!response.ok) throw new Error('Meta report archive temporarily unavailable');
  const dates = readMetaReportDates(await response.json());
  if (!dates) throw new Error('Invalid meta report archive');
  return dates;
});

/** The snapshot of `date`, or `null` when there is none. Throws when Express cannot answer. */
export const loadMetaReport = cache(async (date: string): Promise<MetaReportSnapshot | null> => {
  if (!isMetaReportDate(date)) return null;
  const response = await fetchPublicExpress(`/api/meta-reports/${date}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Meta report temporarily unavailable');
  return readMetaReportSnapshot(await response.json(), date);
});
