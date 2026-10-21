'use client';

import { useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { formatDate } from '../primitives';
import { useThemeTokens } from '../theme/useThemeTokens';
import { formatNumber } from './scale';
import { useId, useLayoutEffect, useSyncExternalStore } from '../primitives/react-compat';

/** A data series of a cartesian chart: which numeric field of each row to plot. */
export interface ChartSeries<T> {
  key: keyof T & string;
  label: string;
  /** Any CSS color. Defaults to the next `--ui-chart-N` token. */
  color?: string;
}

export type ValueFormatter = (value: number) => string;

export function seriesColor(index: number, color?: string) {
  return color ?? `var(--ui-chart-${(index % 8) + 1})`;
}

/**
 * The reference theme's chart palette (vercel.css, light), the value a chart works with until the
 * element's own tokens are read. charts.test.ts keeps it equal to the theme file.
 */
export const REFERENCE_CHART_PALETTE = {
  '--ui-chart-1': '#0070f3',
  '--ui-chart-2': '#7928ca',
  '--ui-chart-3': '#ff0080',
  '--ui-chart-4': '#c4841a',
  '--ui-chart-5': '#0ca386',
  '--ui-chart-6': '#171717',
  '--ui-chart-7': '#8f8f8f',
  '--ui-chart-8': '#e5600b',
};

/** The palette and the text colour of the reference theme, until the element's own are read. */
const PALETTE_TOKENS = { '--ui-fg': '#171717', ...REFERENCE_CHART_PALETTE };

/**
 * `seriesColor` for categories (sankey nodes, treemap groups): the `--ui-chart-N` tokens in
 * order, minus any the theme set to its text colour — a black or white node reads as text, not
 * as a category.
 */
export function useCategoryColor(ref: RefObject<Element | null>) {
  const tokens = useThemeTokens(ref, PALETTE_TOKENS);
  const fg = tokens['--ui-fg'].toLowerCase();
  const usable = [1, 2, 3, 4, 5, 6, 7, 8].filter((k) => tokens[`--ui-chart-${k}` as keyof typeof PALETTE_TOKENS].toLowerCase() !== fg);
  return (index: number, color?: string) =>
    color ?? (usable.length ? `var(--ui-chart-${usable[index % usable.length]})` : seriesColor(index));
}

/** Finite number or null — missing, NaN and non-numeric values never reach a path. */
export function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** The caller's formatter, or locale-aware grouping with up to `digits` decimals. */
export function valueFormat(valueFormatter: ValueFormatter | undefined, locale?: string, digits = 2): ValueFormatter {
  return valueFormatter ?? ((v: number) => formatNumber(v, { maximumFractionDigits: digits }, locale));
}

/** Inline style with CSS custom properties (React's CSSProperties has no index signature for them). */
export function cssVars(vars: Record<`--${string}`, string | number>): CSSProperties {
  return vars as CSSProperties;
}

/* ───────────────────────── Text measurement ───────────────────────── */

export interface TextStyle {
  /** Font size in px. Default 11 (axis labels). */
  size?: number;
  weight?: number;
}

export type MeasureText = (text: string, style?: TextStyle) => number;

/**
 * Average advance of a sans glyph per px of font size. Only used until the real font is
 * known (server render, tests), so it errs slightly wide.
 */
const CHAR_EM = 0.6;

export const estimateTextWidth: MeasureText = (text, style) => Array.from(text).length * (style?.size ?? 11) * CHAR_EM;

let canvas: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

function canvasContext() {
  if (canvas === undefined) canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  return canvas;
}

const DIGIT = /\p{Nd}/u;

/**
 * Canvas has no `font-variant-numeric`, so tabular figures are measured as zeros: every digit
 * becomes its own numeral system's zero ("12" → "00", "١٢" → "٠٠"), as wide as a tabular digit.
 */
export function toTabularDigits(text: string) {
  return text.replace(/\p{Nd}/gu, (digit) => {
    let code = digit.codePointAt(0) ?? 0;
    // Unicode keeps each system's 0–9 contiguous: step back to its zero.
    for (let i = 0; i < 9 && DIGIT.test(String.fromCodePoint(code - 1)); i++) code--;
    return String.fromCodePoint(code);
  });
}

/** Text widths in the given font family through a shared canvas; an estimate without one. */
export function createTextMeasure(fontFamily: string | null): MeasureText {
  const ctx = fontFamily ? canvasContext() : null;
  if (!ctx || !fontFamily) return estimateTextWidth;
  return (text, style) => {
    const font = `${style?.weight ?? 400} ${style?.size ?? 11}px ${fontFamily}`;
    const key = `${font}\n${text}`;
    let width = widths.get(key);
    if (width == null) {
      // shortcut: unbounded growth is capped by a reset; an LRU would keep hot labels.
      if (widths.size > 5000) widths.clear();
      ctx.font = font;
      // Charts render tabular figures (font-variant-numeric on .ui-chart).
      width = ctx.measureText(toTabularDigits(text)).width;
      widths.set(key, width);
    }
    return width;
  };
}

// Theme switches swap the font family (on <html> or a ThemeScope), and web fonts change metrics once loaded:
// both invalidate measurements. One shared observer serves every mounted chart.
let fontEpoch = 0;
const fontListeners = new Set<() => void>();
let stopWatchingFonts: (() => void) | null = null;

function bumpFontEpoch() {
  fontEpoch++;
  widths.clear();
  fontListeners.forEach((listener) => listener());
}

function subscribeFonts(listener: () => void) {
  fontListeners.add(listener);
  if (!stopWatchingFonts && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(bumpFontEpoch);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'], subtree: true });
    const fonts = document.fonts as FontFaceSet | undefined;
    fonts?.addEventListener('loadingdone', bumpFontEpoch);
    stopWatchingFonts = () => {
      observer.disconnect();
      fonts?.removeEventListener('loadingdone', bumpFontEpoch);
    };
  }
  return () => {
    fontListeners.delete(listener);
    if (fontListeners.size === 0) {
      stopWatchingFonts?.();
      stopWatchingFonts = null;
    }
  };
}

/** Measures text in the font the element actually renders with. */
export function useTextMeasure(ref: RefObject<Element | null>): MeasureText {
  const epoch = useSyncExternalStore(subscribeFonts, () => fontEpoch, () => 0);
  const [family, setFamily] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setFamily(getComputedStyle(el).fontFamily || null);
    read();
    // On the first mount the theme attributes are applied by an ancestor's effect, after this one.
    const frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [ref, epoch]);

  // `epoch` invalidates the memo after the shared cache was cleared.
  return useMemo(() => createTextMeasure(family), [family, epoch]);
}

/** Longest prefix of `text` that fits `maxWidth` with an ellipsis; the text itself when it fits. */
export function truncateText(text: string, maxWidth: number, measure: MeasureText = estimateTextWidth, style?: TextStyle) {
  if (measure(text, style) <= maxWidth) return text;
  const chars = Array.from(text);
  const withEllipsis = (count: number) => `${chars.slice(0, count).join('').trimEnd()}…`;
  // Binary search over the number of kept characters (width grows with the prefix).
  let lo = 0;
  let hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(withEllipsis(mid), style) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return withEllipsis(lo);
}

/**
 * Lines of at most `maxWidth` each, at most `maxLines` of them, broken at spaces only (a split
 * word reads as a typo): a word longer than a line is shortened with an ellipsis, and the last
 * line takes the rest of the text, shortened if it still does not fit.
 */
export function wrapText(text: string, maxWidth: number, measure: MeasureText = estimateTextWidth, style?: TextStyle, maxLines = 2): string[] {
  if (measure(text, style) <= maxWidth || maxLines <= 1) return [truncateText(text, maxWidth, measure, style)];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  while (words.length > 0 && lines.length < maxLines - 1) {
    let line = words.shift()!;
    while (words.length > 0 && measure(`${line} ${words[0]}`, style) <= maxWidth) line += ` ${words.shift()}`;
    lines.push(truncateText(line, maxWidth, measure, style));
  }
  if (words.length > 0) lines.push(truncateText(words.join(' '), maxWidth, measure, style));
  return lines;
}

/* ───────────────────────── Colors ───────────────────────── */

/** Hue (degrees) and HSL saturation of a hex or rgb() colour — the form theme palettes are written in; null otherwise. */
export function colorHue(color: string): { hue: number; saturation: number } | null {
  const value = color.trim();
  let rgb: number[] | null = null;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    rgb = [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
  } else {
    const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value);
    if (fn) rgb = fn.slice(1, 4).map(Number);
  }
  if (!rgb || rgb.some((c) => !Number.isFinite(c))) return null;
  const [r, g, b] = rgb.map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const saturation = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let hue = 0;
  if (d > 0) hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, saturation };
}

/** True when two colours read as the same hue (both saturated, hues within `threshold` degrees). */
export function similarHue(a: string, b: string, threshold = 30) {
  const ha = colorHue(a);
  const hb = colorHue(b);
  if (!ha || !hb || ha.saturation < 0.3 || hb.saturation < 0.3) return false;
  const diff = Math.abs(ha.hue - hb.hue);
  return Math.min(diff, 360 - diff) < threshold;
}

/* ───────────────────────── Dates ───────────────────────── */

/** Dates as local calendar days: "2026-03-04" means March 4 in the viewer's zone, not UTC. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Axis label for an x value: short dates, everything else as text. */
export function formatAxisValue(value: unknown, locale?: string) {
  if (value instanceof Date) return formatDate(value, locale, { month: 'short', day: 'numeric' });
  return value == null ? '' : String(value);
}

/** Tooltip title for an x value: dates get the year too. */
export function formatTitleValue(value: unknown, locale?: string) {
  if (value instanceof Date) return formatDate(value, locale, { month: 'short', day: 'numeric', year: 'numeric' });
  return value == null ? '' : String(value);
}

/* ───────────────────────── Misc ───────────────────────── */

/** useId() output contains characters that break `url(#id)` references. */
export function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/**
 * Corner radius of a bar, node or segment. Geometry CSS cannot change comes from theme tokens
 * (useThemeTokens); with `--ui-chart-capsule: 1` a radius is capped at half the shape's thickness,
 * so a large radius gives a capsule, otherwise it applies as given.
 */
export function capsuleRadius(radius: number, thickness: number, capsule: boolean) {
  return capsule ? Math.min(radius, thickness / 2) : radius;
}
