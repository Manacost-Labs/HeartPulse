type TrinketMetricItem = {
  avgPlacement?: number | string | null;
  pickRate?: number | string | null;
  name?: string | null;
};

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
} {
  return {
    averagePlacement: decimalLabel(item.avgPlacement),
    pickRate: percentLabel(item.pickRate),
  };
}
