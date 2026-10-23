/**
 * One observation. `segment` names the series period the point belongs to: the line breaks and a
 * labelled boundary is drawn where it changes, because values of different periods are not one
 * continuous series. `low`/`high` draw an interval band; `tick` is a short axis label;
 * `reference` is a comparison value at the same x, drawn as a dashed line.
 */
export type ChartPoint = {
  x: string | number; y: number | null; label?: string; tick?: string; detail?: string;
  segment?: string; low?: number | null; high?: number | null; reference?: number | null;
};
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

type Positioned = { y: number | null; position: number; segment?: string };

/** Runs of consecutive observed points of one segment: each is drawn as its own line, area and band. */
export function lineRuns<P extends Positioned>(points: P[]): P[][] {
  const runs: P[][] = [];
  let current: P[] = [];
  points.forEach((point, index) => {
    const breaks = point.y === null || (index > 0 && points[index - 1].segment !== point.segment);
    if (breaks && current.length) { runs.push(current); current = []; }
    if (point.y !== null) current.push(point);
  });
  if (current.length) runs.push(current);
  return runs;
}

/** Indexes where a named segment starts after a different one. */
export function segmentStarts(points: Array<{ segment?: string }>): number[] {
  return points.flatMap((point, index) => index > 0 && point.segment && point.segment !== points[index - 1].segment ? [index] : []);
}

/**
 * Period names over a chart, placed right to left so the newest period always keeps its name:
 * each goes right of its mark when it fits before the next one, the last may lean left of it,
 * and an older name that would collide is left to the tooltip. Widths are estimated at 6.2 px a character.
 */
export function placeSegmentLabels<M extends { at: number; label: string }>(marks: M[], left: number, right: number) {
  let freeUntil = right;
  return marks.map((mark, order) => ({ mark, order })).reverse().map(({ mark, order }) => {
    const textWidth = mark.label.length * 6.2 + 8;
    const limit = Math.min(marks[order + 1]?.at ?? right, freeUntil);
    let anchorEnd = false;
    let shown = mark.at + textWidth <= limit;
    if (!shown && order === marks.length - 1 && mark.at - textWidth >= left) { anchorEnd = true; shown = true; }
    if (shown) freeUntil = (anchorEnd ? mark.at - textWidth : mark.at) - 4;
    return { ...mark, anchorEnd, shown };
  }).reverse();
}

/** Rough width of an axis label in 12px Inter: enough to keep labels apart without measuring the DOM. */
export function axisLabelWidth(text: string): number {
  return Math.ceil(text.length * 6.8);
}

/**
 * Which points get an x-axis label. The first label hangs right from its point
 * and the last one left (they stay inside the plot), the others are centred;
 * labels are picked evenly between them only where their real width leaves
 * `gap` pixels to every neighbour, so dates never print over each other.
 */
export function axisLabelIndexes(centers: number[], widths: number[], gap = 14): number[] {
  const count = centers.length;
  if (count <= 1) return count ? [0] : [];
  const last = count - 1;
  const firstEnd = centers[0] + widths[0];
  const lastStart = centers[last] - widths[last];
  if (firstEnd + gap > lastStart) return [last];
  const picked = [0];
  let previousEnd = firstEnd;
  const span = centers[last] - centers[0];
  const average = widths.reduce((sum, value) => sum + value, 0) / count;
  const slots = Math.max(0, Math.floor(span / (average + gap)) - 1);
  for (let slot = 1; slot <= slots; slot += 1) {
    const target = centers[0] + span * slot / (slots + 1);
    let nearest = -1;
    for (let index = 1; index < last; index += 1) {
      if (nearest < 0 || Math.abs(centers[index] - target) < Math.abs(centers[nearest] - target)) nearest = index;
    }
    if (nearest <= (picked.at(-1) ?? 0)) continue;
    const start = centers[nearest] - widths[nearest] / 2;
    const end = centers[nearest] + widths[nearest] / 2;
    if (start >= previousEnd + gap && end + gap <= lastStart) {
      picked.push(nearest);
      previousEnd = end;
    }
  }
  picked.push(last);
  return picked;
}


/** Round tick values (steps of 1, 2, 2.5 or 5 × 10ⁿ) inside the domain, about five intervals apart; counts step by whole numbers. */
export function axisTicks(low: number, high: number, wholeNumbers = false): number[] {
  const rough = (high - low) / 5;
  if (!(rough > 0)) return [low];
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map(factor => factor * magnitude).find(candidate => candidate >= rough * 0.999) ?? rough;
  if (wholeNumbers) step = Math.max(1, Math.ceil(step));
  const ticks: number[] = [];
  for (let value = Math.ceil(low / step - 1e-9) * step; value <= high + step * 1e-9; value += step) ticks.push(Number(value.toPrecision(12)));
  return ticks;
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
