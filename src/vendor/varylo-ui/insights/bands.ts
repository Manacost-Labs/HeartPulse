/* Geometry of a forecast chart with confidence bands, in a 100 × 100 box (y down). Pure. */
import { niceTicks } from './scenario';

export interface BandPoint {
  /** Axis label: a date or a period name. */
  label: string;
  /** Observed value. */
  actual?: number;
  /** Forecast or model estimate. */
  forecast?: number;
  /** Outer interval, e.g. 95%. */
  low?: number;
  high?: number;
  /** Inner interval, e.g. 50%. */
  innerLow?: number;
  innerHigh?: number;
}

export interface BandGeometry {
  domain: [number, number];
  ticks: number[];
  xs: number[];
  /** y in the box for a value. */
  y: (value: number) => number;
  actual: string;
  forecast: string;
  outer: string;
  inner: string;
  /** Indices whose actual lies outside the outer band. */
  outliers: number[];
  /** First index with a forecast and no actual: where the forecast begins. */
  forecastStart: number;
}

const ok = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Path through the defined points; a gap in the data breaks the line. */
function linePath(xs: readonly number[], values: readonly (number | undefined)[], y: (v: number) => number) {
  let d = '';
  let pen = false;
  values.forEach((v, i) => {
    if (!ok(v)) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${r2(xs[i])} ${r2(y(v))} `;
    pen = true;
  });
  return d.trim();
}

/** Closed areas between low and high, one per run of points that have both. */
function bandPath(xs: readonly number[], lows: readonly (number | undefined)[], highs: readonly (number | undefined)[], y: (v: number) => number) {
  const runs: number[][] = [];
  let run: number[] = [];
  lows.forEach((low, i) => {
    if (ok(low) && ok(highs[i])) run.push(i);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);
  return runs
    .map((idx) => {
      const top = idx.map((i, k) => `${k ? 'L' : 'M'}${r2(xs[i])} ${r2(y(highs[i]!))}`).join(' ');
      const bottom = [...idx].reverse().map((i) => `L${r2(xs[i])} ${r2(y(lows[i]!))}`).join(' ');
      return `${top} ${bottom} Z`;
    })
    .join(' ');
}

export function bandGeometry(points: readonly BandPoint[]): BandGeometry {
  const values = points.flatMap((p) => [p.actual, p.forecast, p.low, p.high, p.innerLow, p.innerHigh].filter(ok));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  // Start the axis at zero when the data is close to it, otherwise around the data.
  const ticks = niceTicks(min > 0 && min < (max - min) * 0.6 ? 0 : min, max);
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const span = domain[1] - domain[0] || 1;
  const n = points.length;
  const xs = points.map((_, i) => (n <= 1 ? 50 : (i / (n - 1)) * 100));
  const y = (v: number) => 100 - ((v - domain[0]) / span) * 100;

  let lastActual = -1;
  points.forEach((p, i) => {
    if (ok(p.actual)) lastActual = i;
  });
  // The forecast line picks up from the last actual, so the two read as one line.
  const forecastValues = points.map((p, i) => (i === lastActual && !ok(p.forecast) ? p.actual : p.forecast));
  const forecastStart = points.findIndex((p, i) => i > lastActual && ok(p.forecast));
  const outliers = points.flatMap((p, i) => (ok(p.actual) && ((ok(p.low) && p.actual < p.low) || (ok(p.high) && p.actual > p.high)) ? [i] : []));

  return {
    domain,
    ticks,
    xs,
    y,
    actual: linePath(xs, points.map((p) => p.actual), y),
    forecast: linePath(xs, forecastValues, y),
    outer: bandPath(xs, points.map((p) => p.low), points.map((p) => p.high), y),
    inner: bandPath(xs, points.map((p) => p.innerLow), points.map((p) => p.innerHigh), y),
    outliers,
    forecastStart,
  };
}

/** Index of the point nearest to a horizontal position in percent. */
export function nearestIndex(xs: readonly number[], percent: number): number {
  let best = 0;
  xs.forEach((x, i) => {
    if (Math.abs(x - percent) < Math.abs(xs[best] - percent)) best = i;
  });
  return best;
}
