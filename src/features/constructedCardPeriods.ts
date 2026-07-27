export type ConstructedCardPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';
export type ConstructedCardRank = 'legend' | 'diamond_4_1' | 'diamond' | 'platinum';
export type ConstructedCardStatsFormat = 'standard' | 'wild';

export const CONSTRUCTED_CARD_PERIOD_OPTIONS: ReadonlyArray<{
  id: ConstructedCardPeriod;
  label: string;
}> = [
  { id: '1d', label: 'Последний день' },
  { id: '3d', label: 'Последние 3 дня' },
  { id: '7d', label: 'Последние 7 дней' },
  { id: '14d', label: 'Последние 14 дней' },
  { id: 'patch', label: 'Патч 36.0.3' },
];

export const CONSTRUCTED_CARD_RANK_OPTIONS: ReadonlyArray<{
  id: ConstructedCardRank;
  label: string;
}> = [
  { id: 'legend', label: 'Легенда' },
  { id: 'diamond_4_1', label: 'Алмаз 1–4' },
  { id: 'diamond', label: 'Алмаз' },
  { id: 'platinum', label: 'Платина' },
];

const PERIOD_IDS = new Set<ConstructedCardPeriod>(
  CONSTRUCTED_CARD_PERIOD_OPTIONS.map(option => option.id),
);
const RANK_IDS = new Set<ConstructedCardRank>(
  CONSTRUCTED_CARD_RANK_OPTIONS.map(option => option.id),
);

export function constructedCardPeriodFromSearch(search: string): ConstructedCardPeriod {
  const value = new URLSearchParams(search).get('period') as ConstructedCardPeriod | null;
  return value && PERIOD_IDS.has(value) ? value : '1d';
}

export function constructedCardPeriodLabel(period: ConstructedCardPeriod): string {
  return CONSTRUCTED_CARD_PERIOD_OPTIONS.find(option => option.id === period)?.label ?? 'Последний день';
}

export function constructedCardRankFromSearch(search: string): ConstructedCardRank {
  const value = new URLSearchParams(search).get('rank') as ConstructedCardRank | null;
  return value && RANK_IDS.has(value) ? value : 'legend';
}

export function constructedCardRankLabel(rank: ConstructedCardRank): string {
  return CONSTRUCTED_CARD_RANK_OPTIONS.find(option => option.id === rank)?.label ?? 'Легенда';
}

export function constructedCardStatsFormatFromSearch(
  search: string,
  fallback: ConstructedCardStatsFormat,
): ConstructedCardStatsFormat {
  const value = new URLSearchParams(search).get('statsFormat');
  return value === 'standard' || value === 'wild' ? value : fallback;
}

export function constructedCardStatsFormatLabel(format: ConstructedCardStatsFormat): string {
  return format === 'standard' ? 'Стандарт' : 'Вольный';
}

export function constructedCardPeriodUrl(
  pathname: string,
  period: ConstructedCardPeriod,
  search = '',
): string {
  const params = new URLSearchParams(search);
  if (period === '1d') params.delete('period');
  else params.set('period', period);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}

export function constructedCardStatsUrl(
  pathname: string,
  context: {
    period: ConstructedCardPeriod;
    rank: ConstructedCardRank;
    statsFormat?: ConstructedCardStatsFormat;
    defaultStatsFormat?: ConstructedCardStatsFormat;
  },
  search = '',
): string {
  const params = new URLSearchParams(search);
  if (context.period === '1d') params.delete('period');
  else params.set('period', context.period);
  if (context.rank === 'legend') params.delete('rank');
  else params.set('rank', context.rank);
  if (context.statsFormat && context.statsFormat !== context.defaultStatsFormat) {
    params.set('statsFormat', context.statsFormat);
  } else {
    params.delete('statsFormat');
  }
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ''}`;
}
