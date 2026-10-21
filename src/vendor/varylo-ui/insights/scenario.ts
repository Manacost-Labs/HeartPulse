/* Pure parts of the scenario simulator: input values, formatting, KPI change and chart geometry. */

/** How a number reads: plain, a share (0.05 → 5%), money, or a unit Intl knows ("day", "kilogram"). */
export interface ValueFormat {
  format?: 'number' | 'percent' | 'currency';
  /** Intl unit for `number`, e.g. "month" or "kilogram". */
  unit?: string;
  /** Fraction digits shown. */
  digits?: number;
  /** Short form for big numbers: "1,2 млн" (axis ticks use it). */
  compact?: boolean;
}

export interface ScenarioInput extends ValueFormat {
  id: string;
  label: string;
  min: number;
  max: number;
  /** Default 1. */
  step?: number;
  /** Value of the base scenario. */
  defaultValue: number;
  /** One line on what the input means. */
  description?: string;
}

export interface ScenarioPreset {
  id: string;
  name: string;
  /** Values of the inputs; inputs not listed keep their default. */
  values: Record<string, number>;
  description?: string;
}

export interface ScenarioPoint {
  /** Period label on the axis, e.g. "Янв". */
  label: string;
  value: number;
  /** Lower bound of the uncertainty range. */
  low?: number;
  /** Upper bound of the uncertainty range. */
  high?: number;
}

export interface ScenarioKpi extends ValueFormat {
  id: string;
  label: string;
  value: number;
  low?: number;
  high?: number;
  /** Which way is good. Default `higher`. */
  better?: 'higher' | 'lower';
}

export interface ScenarioResult {
  series: ScenarioPoint[];
  kpis: ScenarioKpi[];
}

/** Clamped to the input's range and snapped to its step (counted from `min`), without float noise. */
export function snapValue(input: Pick<ScenarioInput, 'min' | 'max' | 'step'>, value: number): number {
  if (!Number.isFinite(value)) return input.min;
  const step = input.step && input.step > 0 ? input.step : 1;
  const clamped = Math.min(input.max, Math.max(input.min, value));
  const snapped = input.min + Math.round((clamped - input.min) / step) * step;
  const places = Math.min(12, Math.max(decimalsOf(step), decimalsOf(input.min)));
  return Math.min(input.max, Number(snapped.toFixed(places)));
}

/** Digits after the point as written: 0.05 → 2, 1e-7 → 7. */
function decimalsOf(n: number) {
  const text = String(n);
  const exp = text.indexOf('e-');
  if (exp >= 0) return Number(text.slice(exp + 2)) + Math.max(0, text.indexOf('.') >= 0 ? exp - text.indexOf('.') - 1 : 0);
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Every input's value: given ones snapped, missing ones at their default. */
export function resolveValues(inputs: readonly ScenarioInput[], values: Readonly<Record<string, number>> | undefined): Record<string, number> {
  return Object.fromEntries(inputs.map((input) => [input.id, snapValue(input, values?.[input.id] ?? input.defaultValue)]));
}

export function defaultValues(inputs: readonly ScenarioInput[]): Record<string, number> {
  return resolveValues(inputs, undefined);
}

/** True when `values` is exactly the preset (inputs it leaves out at their default). */
export function matchesPreset(inputs: readonly ScenarioInput[], values: Readonly<Record<string, number>>, preset: ScenarioPreset): boolean {
  const target = resolveValues(inputs, preset.values);
  return inputs.every((input) => target[input.id] === values[input.id]);
}

export function formatValue(value: number, spec: ValueFormat, locale?: string, currency?: string): string {
  const digits = spec.digits;
  const options: Intl.NumberFormatOptions = spec.compact ? { notation: 'compact' } : {};
  if (digits !== undefined) {
    options.minimumFractionDigits = digits;
    options.maximumFractionDigits = digits;
  }
  if (spec.format === 'percent') return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits ?? 1, ...options }).format(value);
  if (spec.format === 'currency' && currency) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits ?? 0, ...options }).format(value);
  }
  if (spec.unit) {
    try {
      return new Intl.NumberFormat(locale, { style: 'unit', unit: spec.unit, unitDisplay: 'short', maximumFractionDigits: digits ?? 1, ...options }).format(value);
    } catch {
      // Not a unit Intl knows: plain number.
    }
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits ?? 1, ...options }).format(value);
}

export interface KpiChange {
  delta: number;
  /** Relative change; undefined when the baseline is 0. */
  ratio?: number;
  direction: 'up' | 'down' | 'flat';
  /** Whether the change is good, by the KPI's `better`; null when flat. */
  good: boolean | null;
}

export function kpiChange(value: number, baseline: number, better: 'higher' | 'lower' = 'higher'): KpiChange {
  const delta = value - baseline;
  const tolerance = Math.max(1e-9, Math.abs(baseline) * 1e-9);
  const direction = Math.abs(delta) <= tolerance ? 'flat' : delta > 0 ? 'up' : 'down';
  const ratio = baseline !== 0 ? delta / Math.abs(baseline) : undefined;
  const good = direction === 'flat' ? null : (direction === 'up') === (better === 'higher');
  return { delta, ratio, direction, good };
}

/** 3–6 round tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  if (ticks[ticks.length - 1] < max) ticks.push(Number((ticks[ticks.length - 1] + step).toPrecision(12)));
  return ticks;
}

export interface ChartGeometry {
  /** Lower and upper end of the value axis. */
  domain: [number, number];
  ticks: number[];
  /** Paths in a 0–100 × 0–100 box (y down). */
  line: string;
  band: string;
  baseline: string;
  /** Point positions, for markers and labels. */
  points: { x: number; y: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Paths of the forecast, its band and the baseline in a 100 × 100 box. */
export function chartGeometry(series: readonly ScenarioPoint[], baseline: readonly ScenarioPoint[] = []): ChartGeometry {
  const all = [...series, ...baseline].flatMap((p) => [p.value, p.low ?? p.value, p.high ?? p.value]).filter(Number.isFinite);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(...all, 0));
  const domain: [number, number] = [ticks[0], ticks[ticks.length - 1]];
  const span = domain[1] - domain[0] || 1;
  const n = Math.max(series.length, baseline.length);
  const x = (i: number) => (n <= 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - ((v - domain[0]) / span) * 100;
  const path = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`).join(' ');
  const points = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const hasBand = series.some((p) => p.low !== undefined || p.high !== undefined);
  const band = hasBand
    ? `${path([...series.map((p, i) => ({ x: x(i), y: y(p.high ?? p.value) })), ...series.map((p, i) => ({ x: x(i), y: y(p.low ?? p.value) })).reverse()])} Z`
    : '';
  return {
    domain,
    ticks,
    line: path(points),
    band,
    baseline: path(baseline.map((p, i) => ({ x: x(i), y: y(p.value) }))),
    points,
  };
}
