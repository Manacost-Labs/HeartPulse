export type ConstructedCardPeriod = '1d' | '3d' | '7d' | '14d' | 'patch';

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

const PERIOD_IDS = new Set<ConstructedCardPeriod>(
  CONSTRUCTED_CARD_PERIOD_OPTIONS.map(option => option.id),
);

export function constructedCardPeriodFromSearch(search: string): ConstructedCardPeriod {
  const value = new URLSearchParams(search).get('period') as ConstructedCardPeriod | null;
  return value && PERIOD_IDS.has(value) ? value : '1d';
}

export function constructedCardPeriodLabel(period: ConstructedCardPeriod): string {
  return CONSTRUCTED_CARD_PERIOD_OPTIONS.find(option => option.id === period)?.label ?? 'Последний день';
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
