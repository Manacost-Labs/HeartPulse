export type ChartPoint = { x: string | number; y: number | null; label?: string; detail?: string };
export type DomainOptions = { minimum?: number; maximum?: number };

/** Missing and non-finite observations do not influence the scale. */
export function chartDomain(values: Array<number | null>, options: DomainOptions = {}): [number, number] {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!finite.length) return [options.minimum ?? 0, options.maximum ?? 1];
  const low = Math.min(...finite);
  const high = Math.max(...finite);
  const padding = high === low
    ? Math.max(Math.abs(high) * 0.05, high === 0 ? 1 : 0.000001)
    : Math.max((high - low) * 0.12, 0.000001);
  const step = 10 ** Math.floor(Math.log10(Math.max(high - low, padding * 2))) / 2;
  const minimum = options.minimum ?? Math.floor((low - padding) / step) * step;
  const maximum = options.maximum ?? Math.ceil((high + padding) / step) * step;
  return [minimum, Math.max(minimum + step, maximum)];
}

/** Numeric coordinates preserve turn/date gaps; categorical ones retain input order. */
export function lineCoordinates(points: ChartPoint[]) {
  const numeric = points.every(point => typeof point.x === 'number' && Number.isFinite(point.x));
  const values = numeric ? points.map(point => Number(point.x)) : points.map((_, index) => index);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return points.map((point, index) => ({
    ...point,
    y: typeof point.y === 'number' && Number.isFinite(point.y) ? point.y : null,
    position: high === low ? 0.5 : (values[index] - low) / (high - low),
  }));
}

/** Keep small values visible; axes can request precision that separates neighbouring ticks. */
export function formatChartValue(value: number | null, unit = '', fractionDigits = 2): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const digits = unit === 'count' ? 0 : Math.min(6, Math.max(fractionDigits, value === 0 ? 2 : 1 - Math.floor(Math.log10(Math.abs(value)))));
  return value.toLocaleString('ru-RU', { maximumFractionDigits: digits }) + (unit === 'count' ? '' : unit);
}

/** Strings cannot become formulas when the CSV is opened in a spreadsheet. */
export function csvDocument(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const cell = (value: string | number | null | undefined) => {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    let text = value == null ? '' : String(value);
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}
