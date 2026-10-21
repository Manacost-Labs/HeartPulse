/*
 * Scales, ticks, number formatting and SVG path builders shared by every chart.
 * Pure functions only — no React — so they are cheap to unit test.
 */

export type Point = readonly [x: number, y: number];
export type Curve = 'linear' | 'monotone';

const TAU = Math.PI * 2;

/* ───────────────────────── Scales ───────────────────────── */

export interface LinearScale {
  (value: number): number;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
  invert(position: number): number;
}

/** Maps a numeric domain onto a pixel range. A zero-width domain maps to the middle of the range. */
export function scaleLinear(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0;
  const scale = (value: number) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0));
  return Object.assign(scale, {
    domain,
    range,
    invert: (position: number) => (r1 === r0 ? d0 : d0 + ((position - r0) / (r1 - r0)) * span),
  });
}

export interface BandScale {
  /** Distance between the starts of two neighbouring bands. */
  step: number;
  /** Width of one band (step minus inner padding). */
  bandwidth: number;
  start(index: number): number;
  center(index: number): number;
  /** Band under a pixel position; the hit areas tile the whole range without gaps. */
  indexAt(position: number): number;
}

/**
 * Splits a range into `count` equal bands. Outer padding is half the inner padding,
 * so every band plus the padding around it is exactly one `step` wide.
 */
export function scaleBand(count: number, range: readonly [number, number], padding = 0.2): BandScale {
  const [r0, r1] = range;
  const n = Math.max(0, Math.floor(count));
  const step = n > 0 ? (r1 - r0) / n : r1 - r0;
  const bandwidth = step * (1 - padding);
  const offset = r0 + (step * padding) / 2;
  return {
    step,
    bandwidth,
    start: (index) => offset + index * step,
    center: (index) => offset + index * step + bandwidth / 2,
    indexAt: (position) => (n === 0 || step === 0 ? -1 : Math.min(n - 1, Math.max(0, Math.floor((position - r0) / step)))),
  };
}

/* ───────────────────────── Ticks ───────────────────────── */

export interface NiceTicks {
  domain: [number, number];
  ticks: number[];
  step: number;
}

/**
 * Rounds a domain outward to "nice" steps (1, 2, 2.5, 5 × 10ⁿ) using at most
 * `count` intervals. Non-finite input and empty spans fall back to sensible
 * domains, so callers never get NaN.
 */
export function niceTicks(min: number, max: number, count = 5): NiceTicks {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    if (lo === 0) hi = 1;
    else if (lo > 0) lo = 0;
    else hi = 0;
  }
  const intervals = Math.max(1, Math.floor(count));
  const raw = (hi - lo) / intervals;
  const power = 10 ** Math.floor(Math.log10(raw));
  let step = 10 * power;
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const candidate = factor * power;
    if (Math.ceil(hi / candidate - 1e-9) - Math.floor(lo / candidate + 1e-9) <= intervals) {
      step = candidate;
      break;
    }
  }
  const start = Math.floor(lo / step + 1e-9);
  const end = Math.ceil(hi / step - 1e-9);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  const ticks: number[] = [];
  for (let i = start; i <= end; i++) ticks.push(Number((i * step).toFixed(decimals)));
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks, step };
}

/** A label along an axis: where it belongs and how wide it renders. */
export interface LabelBox {
  position: number;
  width: number;
}

export interface PlacedLabel {
  index: number;
  /** Draw position for an SVG `text-anchor` of `anchor`. */
  x: number;
  anchor: 'start' | 'middle' | 'end';
}

/**
 * Evenly thinned, non-overlapping labels: every k-th label for the smallest k that fits,
 * counted back from the last one so the latest point is always labelled. Labels that would
 * cross an edge are shifted inside [0, length]; a shifted first label that collides with
 * its neighbour is dropped rather than thinning the whole axis. A last label that the shift moved
 * within ¾ of the regular spacing of its neighbour would read as a pair: the axis thins further
 * instead, so the spacing stays even.
 */
export function placeLabels(items: readonly LabelBox[], length: number, gap = 8): PlacedLabel[] {
  const n = items.length;
  for (let every = 1; every <= n; every++) {
    const placed: (PlacedLabel & { end: number; shifted: boolean })[] = [];
    let fits = true;
    for (let i = (n - 1) % every; i < n; i += every) {
      const { position, width } = items[i];
      const start = Math.max(0, Math.min(position - width / 2, length - width));
      const shifted = start !== position - width / 2;
      const anchor = !shifted ? 'middle' : start === 0 ? 'start' : 'end';
      const prev = placed[placed.length - 1];
      if (prev && start < prev.end + gap) {
        if (placed.length === 1 && prev.shifted && prev.anchor === 'start') placed.pop();
        else {
          fits = false;
          break;
        }
      }
      placed.push({ index: i, x: anchor === 'start' ? start : anchor === 'end' ? start + width : position, anchor, end: start + width, shifted });
    }
    if (fits) {
      const last = placed[placed.length - 1];
      const prev = placed[placed.length - 2];
      if (placed.length >= 3 && last.shifted && last.anchor === 'end') {
        const regular = items[last.index].position - items[prev.index].position;
        const center = last.end - items[last.index].width / 2;
        if (center - items[prev.index].position < regular * 0.75) continue;
      }
      return placed.map(({ index, x, anchor }) => ({ index, x, anchor }));
    }
  }
  return [];
}

/* ───────────────────────── Formatting ───────────────────────── */

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(options: Intl.NumberFormatOptions, locale?: string) {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    formatters.set(key, formatter);
  }
  return formatter;
}

export function formatNumber(value: number, options: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }, locale?: string) {
  return Number.isFinite(value) ? getFormatter(options, locale).format(value) : '–';
}

/** 1234 → "1.2K", 3_400_000 → "3.4M". */
export function formatCompact(value: number, locale?: string) {
  return formatNumber(value, { notation: 'compact', maximumFractionDigits: 1 }, locale);
}

/** 0.1234 → "12.3%". */
export function formatPercent(ratio: number, digits = 1, locale?: string) {
  return formatNumber(ratio, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: digits }, locale);
}

/* ───────────────────────── Paths ───────────────────────── */

// Two decimals keep path strings short without visible loss at screen resolution.
const r = (n: number) => Math.round(n * 100) / 100;

/**
 * Monotone cubic tangents (Steffen's method, as in d3's curveMonotoneX):
 * the curve never overshoots the data, so a smoothed line cannot invent peaks.
 */
export function monotoneTangents(points: readonly Point[]): number[] {
  const n = points.length;
  if (n < 2) return n === 1 ? [0] : [];
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    secants.push(dx === 0 ? 0 : (points[i + 1][1] - points[i][1]) / dx);
  }
  const tangents = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = secants[i - 1];
    const s1 = secants[i];
    if (s0 * s1 <= 0) continue;
    const h0 = points[i][0] - points[i - 1][0];
    const h1 = points[i + 1][0] - points[i][0];
    const p = h0 + h1 === 0 ? 0 : (s0 * h1 + s1 * h0) / (h0 + h1);
    tangents[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
  }
  // One-sided estimate at the ends keeps the first/last segment from flattening out.
  tangents[0] = n > 2 ? (3 * secants[0] - tangents[1]) / 2 : secants[0];
  tangents[n - 1] = n > 2 ? (3 * secants[n - 2] - tangents[n - 2]) / 2 : secants[n - 2];
  return tangents;
}

/** Path commands after the initial move-to (so segments can be appended to other paths). */
function segments(points: readonly Point[], curve: Curve) {
  if (points.length < 2) return '';
  let d = '';
  if (curve === 'linear' || points.length === 2) {
    for (let i = 1; i < points.length; i++) d += `L${r(points[i][0])},${r(points[i][1])}`;
    return d;
  }
  const t = monotoneTangents(points);
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const dx = (x1 - x0) / 3;
    d += `C${r(x0 + dx)},${r(y0 + dx * t[i])},${r(x1 - dx)},${r(y1 - dx * t[i + 1])},${r(x1)},${r(y1)}`;
  }
  return d;
}

export function linePath(points: readonly Point[], curve: Curve = 'linear') {
  if (points.length === 0) return '';
  return `M${r(points[0][0])},${r(points[0][1])}${segments(points, curve)}`;
}

/** Closed area between a top line and a bottom line (a flat baseline or the series below in a stack). */
export function areaPath(top: readonly Point[], bottom: readonly Point[], curve: Curve = 'linear') {
  if (top.length === 0 || bottom.length === 0) return '';
  const back = [...bottom].reverse();
  return `${linePath(top, curve)}L${r(back[0][0])},${r(back[0][1])}${segments(back, curve)}Z`;
}

/** Splits a series at missing values so a line shows a gap instead of dropping to zero. */
export function splitDefined<P>(items: readonly (P | null | undefined)[]): P[][] {
  const runs: P[][] = [];
  let run: P[] = [];
  for (const item of items) {
    if (item == null) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(item);
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

/** Point on a circle; angle in radians, 0 = 12 o'clock, growing clockwise. */
export function polar(cx: number, cy: number, radius: number, angle: number): Point {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

const pt = (p: Point) => `${r(p[0])},${r(p[1])}`;

/** Open arc along a circle — stroke it for gauges and progress rings. */
export function arcLinePath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const span = endAngle - startAngle;
  if (!(span > 0) || !(radius > 0)) return '';
  if (span >= TAU - 1e-6) {
    // SVG cannot draw a full circle with one arc command, so draw two halves.
    const mid = startAngle + Math.PI;
    return `M${pt(polar(cx, cy, radius, startAngle))}A${r(radius)},${r(radius)} 0 1 1 ${pt(polar(cx, cy, radius, mid))}A${r(radius)},${r(radius)} 0 1 1 ${pt(polar(cx, cy, radius, startAngle))}`;
  }
  const large = span > Math.PI ? 1 : 0;
  return `M${pt(polar(cx, cy, radius, startAngle))}A${r(radius)},${r(radius)} 0 ${large} 1 ${pt(polar(cx, cy, radius, endAngle))}`;
}

export interface ArcOptions {
  cx?: number;
  cy?: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  /** Rounds the four corners of a ring segment; ignored for pie wedges (innerRadius 0). */
  cornerRadius?: number;
}

/** Filled ring segment (donut slice). Angles in radians, 0 = 12 o'clock, clockwise. */
export function arcPath({ cx = 0, cy = 0, innerRadius, outerRadius, startAngle, endAngle, cornerRadius = 0 }: ArcOptions) {
  const span = endAngle - startAngle;
  const ro = outerRadius;
  const ri = Math.max(0, Math.min(innerRadius, ro));
  if (!(span > 0) || !(ro > 0)) return '';
  const R = r(ro);
  const Ri = r(ri);

  if (span >= TAU - 1e-6) {
    const mid = startAngle + Math.PI;
    const outer = `M${pt(polar(cx, cy, ro, startAngle))}A${R},${R} 0 1 1 ${pt(polar(cx, cy, ro, mid))}A${R},${R} 0 1 1 ${pt(polar(cx, cy, ro, startAngle))}Z`;
    if (ri === 0) return outer;
    // Inner circle drawn counter-clockwise so the non-zero fill rule cuts the hole.
    return `${outer}M${pt(polar(cx, cy, ri, startAngle))}A${Ri},${Ri} 0 1 0 ${pt(polar(cx, cy, ri, mid))}A${Ri},${Ri} 0 1 0 ${pt(polar(cx, cy, ri, startAngle))}Z`;
  }

  const large = (s: number) => (s > Math.PI ? 1 : 0);
  if (ri === 0) {
    return `M${pt([cx, cy])}L${pt(polar(cx, cy, ro, startAngle))}A${R},${R} 0 ${large(span)} 1 ${pt(polar(cx, cy, ro, endAngle))}Z`;
  }

  const rc = Math.max(0, Math.min(cornerRadius, (ro - ri) / 2, (ri * span) / 2));
  if (rc === 0) {
    return (
      `M${pt(polar(cx, cy, ro, startAngle))}A${R},${R} 0 ${large(span)} 1 ${pt(polar(cx, cy, ro, endAngle))}` +
      `L${pt(polar(cx, cy, ri, endAngle))}A${Ri},${Ri} 0 ${large(span)} 0 ${pt(polar(cx, cy, ri, startAngle))}Z`
    );
  }

  // Corners are quadratic curves with the sharp corner as control point — visually
  // indistinguishable from true circular fillets at these sizes and much simpler.
  const ao = rc / ro;
  const ai = rc / ri;
  const p = (radius: number, angle: number) => pt(polar(cx, cy, radius, angle));
  return (
    `M${p(ro - rc, startAngle)}Q${p(ro, startAngle)} ${p(ro, startAngle + ao)}` +
    `A${R},${R} 0 ${large(span - 2 * ao)} 1 ${p(ro, endAngle - ao)}` +
    `Q${p(ro, endAngle)} ${p(ro - rc, endAngle)}` +
    `L${p(ri + rc, endAngle)}Q${p(ri, endAngle)} ${p(ri, endAngle - ai)}` +
    `A${Ri},${Ri} 0 ${large(span - 2 * ai)} 0 ${p(ri, startAngle + ai)}` +
    `Q${p(ri, startAngle)} ${p(ri + rc, startAngle)}Z`
  );
}

/** Rectangle with an individual radius per corner: [top-left, top-right, bottom-right, bottom-left]. */
export function roundedRectPath(x: number, y: number, width: number, height: number, radii: readonly [number, number, number, number]) {
  if (!(width > 0) || !(height > 0)) return '';
  let [tl, tr, br, bl] = radii.map((v) => Math.max(0, v));
  // Shrink all radii proportionally when neighbouring corners would overlap.
  const f = Math.min(1, width / (tl + tr || 1), width / (bl + br || 1), height / (tl + bl || 1), height / (tr + br || 1));
  [tl, tr, br, bl] = [tl * f, tr * f, br * f, bl * f];
  const arc = (rad: number, ex: number, ey: number) => (rad > 0 ? `A${r(rad)},${r(rad)} 0 0 1 ${r(ex)},${r(ey)}` : '');
  return (
    `M${r(x + tl)},${r(y)}H${r(x + width - tr)}${arc(tr, x + width, y + tr)}` +
    `V${r(y + height - br)}${arc(br, x + width - br, y + height)}` +
    `H${r(x + bl)}${arc(bl, x, y + height - bl)}` +
    `V${r(y + tl)}${arc(tl, x + tl, y)}Z`
  );
}

export type BarEdge = 'top' | 'bottom' | 'left' | 'right';

/** Bar with only its far end rounded (the end pointing away from the baseline). */
export function barPath(x: number, y: number, width: number, height: number, radius: number, edge: BarEdge) {
  const radii: Record<BarEdge, [number, number, number, number]> = {
    top: [radius, radius, 0, 0],
    right: [0, radius, radius, 0],
    bottom: [0, 0, radius, radius],
    left: [radius, 0, 0, radius],
  };
  return roundedRectPath(x, y, width, height, radii[edge]);
}
