import type { HomeSummaryData } from '../../../src/modules/home/public';

/** Project only the public fields used by the home hero into the SSR payload. */
export function homeSummaryData(value: unknown): HomeSummaryData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid home summary');
  const classes = (value as Record<string, unknown>).topClasses;
  if (!Array.isArray(classes)) throw new Error('Invalid home summary classes');
  const topClasses = classes.flatMap(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    if (typeof row.id !== 'string' || !row.id
      || typeof row.name !== 'string' || !row.name
      || typeof row.winrate !== 'number' || !Number.isFinite(row.winrate)
      || row.winrate < 0 || row.winrate > 100) return [];
    return [{ id: row.id, name: row.name, winrate: row.winrate }];
  });
  return { topClasses, topCards: [], topLegendaries: [] };
}
