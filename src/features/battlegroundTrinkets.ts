import { publicResourceUrl } from '../publicResourceUrl';

type TrinketMetricItem = {
  avgPlacement?: number | string | null;
  pickRate?: number | string | null;
  games?: number | string | null;
  name?: string | null;
};

type TrinketIdentity = {
  id?: string | null;
};

type TrinketPlacementEntry = {
  place?: number | string | null;
  rate?: number | string | null;
};

export type TrinketMmr = 'ALL' | 'TOP_50_PERCENT' | 'TOP_20_PERCENT' | 'TOP_5_PERCENT' | 'TOP_1_PERCENT';
export type TrinketTimeRange = 'CURRENT_BATTLEGROUNDS_PATCH' | 'LAST_7_DAYS';
export type TrinketView = 'table' | 'gallery';

export const TRINKET_MMR_OPTIONS: Array<{ id: TrinketMmr; label: string }> = [
  { id: 'ALL', label: 'Все игроки' },
  { id: 'TOP_50_PERCENT', label: 'Топ 50%' },
  { id: 'TOP_20_PERCENT', label: 'Топ 20%' },
  { id: 'TOP_5_PERCENT', label: 'Топ 5%' },
  { id: 'TOP_1_PERCENT', label: 'Топ 1%' },
];

export const TRINKET_TIME_RANGE_OPTIONS: Array<{ id: TrinketTimeRange; label: string }> = [
  { id: 'LAST_7_DAYS', label: '7 дней' },
  { id: 'CURRENT_BATTLEGROUNDS_PATCH', label: 'Текущий патч' },
];

function metricNumber(value: unknown): number | null {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function decimalLabel(value: unknown): string {
  const parsed = metricNumber(value);
  return parsed === null ? '—' : parsed.toFixed(2).replace('.', ',');
}

function percentLabel(value: unknown): string {
  const parsed = metricNumber(value);
  if (parsed === null) return '—';
  const raw = String(value ?? '').trim();
  const decimals = raw.match(/[.,](\d+)/)?.[1]?.length ?? 1;
  return `${parsed.toFixed(Math.min(2, Math.max(0, decimals))).replace('.', ',')}%`;
}

function gamesLabel(value: unknown): string {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return '—';
  return `≥ ${parsed.toLocaleString('ru-RU').replace(/\s/g, ' ')}`;
}

export function normalizeTrinketMmr(value: unknown): TrinketMmr {
  const normalized = String(value || '').toUpperCase();
  return TRINKET_MMR_OPTIONS.some(option => option.id === normalized)
    ? normalized as TrinketMmr
    : 'TOP_1_PERCENT';
}

export function normalizeTrinketTimeRange(value: unknown): TrinketTimeRange {
  const normalized = String(value || '').toUpperCase();
  return TRINKET_TIME_RANGE_OPTIONS.some(option => option.id === normalized)
    ? normalized as TrinketTimeRange
    : 'LAST_7_DAYS';
}

/** Keeps the visual mode shareable without accepting arbitrary URL values. */
export function normalizeTrinketView(value: unknown): TrinketView {
  return String(value || '').toLowerCase() === 'gallery' ? 'gallery' : 'table';
}

/** Replaces only trinket controls while retaining unrelated deep-link params. */
export function updateTrinketUrlState(updates: {
  size?: string;
  mmr?: TrinketMmr;
  timeRange?: TrinketTimeRange;
  view?: TrinketView;
}): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  params.set('list', 'trinkets');
  Object.entries(updates).forEach(([key, value]) => { if (value) params.set(key, value); });
  window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
}

export function buildTrinketStatsRequest(mmr: TrinketMmr, timeRange: TrinketTimeRange): string {
  const params = new URLSearchParams({
    list: 'trinkets',
    mmr,
    timeRange,
  });
  return `/api/bg/tier-lists?${params.toString()}`;
}

export function sortTrinketTierItems<T extends TrinketMetricItem>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftPlacement = metricNumber(left.avgPlacement);
    const rightPlacement = metricNumber(right.avgPlacement);
    if (leftPlacement === null && rightPlacement !== null) return 1;
    if (leftPlacement !== null && rightPlacement === null) return -1;
    if (leftPlacement !== null && rightPlacement !== null && leftPlacement !== rightPlacement) {
      return leftPlacement - rightPlacement;
    }
    const leftPickRate = metricNumber(left.pickRate) ?? -1;
    const rightPickRate = metricNumber(right.pickRate) ?? -1;
    if (leftPickRate !== rightPickRate) return rightPickRate - leftPickRate;
    return String(left.name || '').localeCompare(String(right.name || ''), 'ru');
  });
}

export function trinketMetricView(item: TrinketMetricItem): {
  averagePlacement: string;
  pickRate: string;
  games: string;
} {
  return {
    averagePlacement: decimalLabel(item.avgPlacement),
    pickRate: percentLabel(item.pickRate),
    games: gamesLabel(item.games),
  };
}

/**
 * Trinkets are a statistical table, so hiding part of a tier makes comparison
 * needlessly difficult. Other lists retain their existing progressive reveal.
 */
export function tierItemsForDisplay<T>(items: T[], list: string, visibleLimit: number): T[] {
  return list === 'trinkets' ? items : items.slice(0, visibleLimit);
}

/** Full art is mirrored on our own card database and can be cached at the edge. */
export function trinketFullArtUrl(item: TrinketIdentity): string {
  const cardId = String(item?.id || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(cardId)) return '';
  return publicResourceUrl(`https://api.kolodahearthstone.com/uploads/library-full-art/${encodeURIComponent(cardId)}.png`);
}

/** Transparent localized card render used by gallery tiles and the hover preview. */
export function trinketCardImageUrl(item: TrinketIdentity): string {
  const cardId = String(item?.id || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(cardId)) return '';
  const params = new URLSearchParams({ id: cardId, locale: 'ruRU', size: '512x' });
  return publicResourceUrl(`https://bg.kolodahearthstone.ru/api/card-art?${params.toString()}`);
}

/** Normalizes sparse HSReplay placement data into eight comparable bars. */
export function trinketPlacementBars(entries: TrinketPlacementEntry[] | null | undefined): Array<{
  place: number;
  rate: number;
  height: number;
}> {
  const rateByPlace = new Map<number, number>();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const place = Number.parseInt(String(entry?.place ?? ''), 10);
    const rate = metricNumber(entry?.rate);
    if (place >= 1 && place <= 8 && rate !== null) rateByPlace.set(place, Math.max(0, rate));
  }

  const rates = Array.from({ length: 8 }, (_, index) => rateByPlace.get(index + 1) ?? 0);
  const peak = Math.max(...rates, 0);
  return rates.map((rate, index) => ({
    place: index + 1,
    rate,
    height: peak > 0 ? Math.round((rate / peak) * 100) : 0,
  }));
}
