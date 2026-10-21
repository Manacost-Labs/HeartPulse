/*
 * Small statistics for chart overlays: least-squares trend lines, moving averages and
 * area-proportional bubble sizes. Pure functions, no React.
 */

export interface Regression {
  slope: number;
  intercept: number;
  /** Coefficient of determination in [0, 1]; 1 when every point lies on the line. */
  r2: number;
  /** Predicted y for an x. */
  predict(x: number): number;
}

/**
 * Ordinary least squares fit of y = slope·x + intercept. Non-finite points are ignored.
 * Null when there are fewer than two distinct x values (no line is defined).
 */
export function linearRegression(points: readonly { x: number; y: number }[]): Regression | null {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const n = valid.length;
  if (n < 2) return null;
  // Centre the data first: sums of squares of large raw values lose precision.
  const mx = valid.reduce((s, p) => s + p.x, 0) / n;
  const my = valid.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of valid) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  // A flat series is fitted perfectly by a flat line.
  const r2 = syy === 0 ? 1 : Math.min(1, (sxy * sxy) / (sxx * syy));
  return { slope, intercept, r2, predict: (x) => slope * x + intercept };
}

/**
 * Simple moving average over `period` values: null until a full window is available and
 * for any window that contains a missing value, so the overlay breaks with the data.
 */
export function movingAverage(values: readonly (number | null)[], period: number): (number | null)[] {
  const size = Math.max(1, Math.floor(period));
  const out: (number | null)[] = [];
  let sum = 0;
  let missing = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) missing++;
    else sum += v;
    if (i >= size) {
      const old = values[i - size];
      if (old == null || !Number.isFinite(old)) missing--;
      else sum -= old;
    }
    out.push(i >= size - 1 && missing === 0 ? sum / size : null);
  }
  return out;
}

/**
 * Bubble radius whose *area* is proportional to the value (radius ∝ √value), so a value
 * twice as large looks twice as large. Values ≤ 0 get the minimum radius.
 */
export function bubbleRadius(value: number, maxValue: number, maxRadius: number, minRadius = 3) {
  if (!(maxValue > 0) || !(value > 0)) return minRadius;
  return Math.max(minRadius, Math.sqrt(Math.min(1, value / maxValue)) * maxRadius);
}
