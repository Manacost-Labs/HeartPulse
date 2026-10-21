'use client';

import { useEffect, useState } from 'react';
import { inlineArrowStep, useEventCallback, type Direction } from '../primitives';

/* In colour-wheel order, so neighbours are analogous hues (never a clashing green + magenta pair). */
const PLACEHOLDER_HUES = ['blue', 'teal', 'green', 'amber', 'red', 'pink', 'purple'] as const;
export type PlaceholderHue = (typeof PLACEHOLDER_HUES)[number];

/** FNV-1a: stable across renders and SSR, so a seed always maps to the same placeholder. */
export function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Two neighbouring hues on the colour wheel and a gradient angle derived from `seed`. */
export function placeholderColors(seed: string): { from: PlaceholderHue; to: PlaceholderHue; angle: number } {
  const hash = hashString(seed);
  const a = hash % PLACEHOLDER_HUES.length;
  const b = (a + ((hash >>> 8) % 2 ? 1 : PLACEHOLDER_HUES.length - 1)) % PLACEHOLDER_HUES.length;
  return { from: PLACEHOLDER_HUES[a], to: PLACEHOLDER_HUES[b], angle: (hash >>> 16) % 360 };
}

/**
 * `Intl` formatters are costly to build, so each options/locale pair is created once.
 * An undefined locale means the runtime (browser) default.
 */
const formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(
  key: string,
  locale: string | undefined,
  create: (locale: string | undefined) => T,
): T {
  const id = `${key}|${locale ?? ''}`;
  let format = formatters.get(id) as T | undefined;
  if (!format) {
    format = create(locale);
    formatters.set(id, format);
  }
  return format;
}

const numberFormat = (locale: string | undefined, key: string, options: Intl.NumberFormatOptions) =>
  cached(key, locale, (l) => new Intl.NumberFormat(l, options));

const moneyFormat = (currency: string, locale?: string) =>
  numberFormat(locale, `money:${currency}`, { style: 'currency', currency });

/** Minor units per major unit: 100 for USD, 1 for JPY. Depends on the currency only, never on the locale. */
export function minorUnitFactor(currency: string) {
  return 10 ** (moneyFormat(currency, 'en').resolvedOptions().maximumFractionDigits ?? 2);
}

/** Formats an integer amount of minor units (cents). */
export function formatMoney(amount: number, currency = 'USD', locale?: string) {
  return moneyFormat(currency, locale).format(amount / minorUnitFactor(currency));
}

/** Currencies whose shop prices are quoted in whole units: "18 990 ₽" rather than "18 990,00 ₽". */
const WHOLE_UNIT_CURRENCIES = new Set(['RUB', 'UAH', 'KZT', 'BYN', 'CZK', 'HUF']);

/**
 * A shop price (cards, cart, order summary): formatMoney, except that a whole amount in a whole-unit
 * currency drops its zero minor digits. Amounts with kopecks keep them; invoices use formatMoney.
 */
export function formatPrice(amount: number, currency = 'USD', locale?: string) {
  const factor = minorUnitFactor(currency);
  if (!WHOLE_UNIT_CURRENCIES.has(currency.toUpperCase()) || amount % factor !== 0) return formatMoney(amount, currency, locale);
  return numberFormat(locale, `price:${currency}`, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
    amount / factor,
  );
}

export function currencySymbol(currency = 'USD', locale?: string) {
  return moneyFormat(currency, locale).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
}

function decimalSeparator(locale?: string) {
  return numberFormat(locale, 'decimal', {}).formatToParts(1.5).find((part) => part.type === 'decimal')?.value ?? '.';
}

/** Minor units → plain editable text in the locale's notation: 12900 → "129", 1250 → "12.5" (or "12,5"). */
export function moneyToInput(amount: number, currency = 'USD', locale?: string) {
  const factor = minorUnitFactor(currency);
  return numberFormat(locale, `input:${factor}`, {
    useGrouping: false,
    maximumFractionDigits: Math.log10(factor),
  }).format(amount / factor);
}

/**
 * Free-form user text → integer minor units, or null when it is not a number.
 * The last "." or "," is the decimal mark when both kinds appear, or when it occurs
 * once and is either the locale's decimal mark or can't be a thousands separator
 * (not followed by exactly three digits): "1,299.50", "1.299,50", "12,5", "1,299"
 * and "1.299.000" all parse as expected.
 */
export function parseMoneyInput(text: string, currency = 'USD', locale?: string): number | null {
  const clean = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(clean)) return null;
  const last = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
  let normalized = clean.replace(/[.,]/g, '');
  if (last !== -1) {
    const fraction = clean.slice(last + 1).replace(/[.,]/g, '');
    const mixed = clean.includes('.') && clean.includes(',');
    const single = clean.indexOf(clean[last]) === last;
    if (mixed || (single && (clean[last] === decimalSeparator(locale) || fraction.length !== 3))) {
      normalized = `${clean.slice(0, last).replace(/[.,]/g, '')}.${fraction}`;
    }
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? Math.round(value * minorUnitFactor(currency)) : null;
}

/** 1234 → "1.2K", 15300000 → "15.3M". */
export function formatCompactNumber(value: number, locale?: string) {
  return numberFormat(locale, 'compact', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function formatInteger(value: number, locale?: string) {
  return numberFormat(locale, 'integer', { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(fraction: number, locale?: string) {
  return numberFormat(locale, 'percent', { style: 'percent', maximumFractionDigits: 2 }).format(fraction);
}

/** `timeZone`: an IANA zone (the ThemeProvider's, so server and browser print the same day); undefined = the reader's. */
const dateFormat = (locale: string | undefined, key: string, options: Intl.DateTimeFormatOptions, timeZone?: string) =>
  cached(`${key}@${timeZone ?? ''}`, locale, (l) => new Intl.DateTimeFormat(l, { ...options, timeZone }));

export type DateInput = Date | string | number;

const toTime = (input: DateInput) => new Date(input).getTime();

export interface RelativeTimeText {
  /** Feed-style age shown on screen: "now", "5m", "3h", "6d", then "Mar 4". */
  text: string;
  /** Unambiguous phrase for screen readers: "5 minutes ago" ("5m" may be read as metres). */
  spoken: string;
}

/** Age of `input` relative to `now` in the given locale, or null for invalid dates. */
export function formatRelativeTime(
  input: DateInput,
  { now = Date.now(), locale, timeZone }: { now?: number; locale?: string; timeZone?: string } = {},
): RelativeTimeText | null {
  const time = toTime(input);
  if (Number.isNaN(time)) return null;
  const seconds = Math.max(0, Math.floor((now - time) / 1000));
  if (seconds < 60) {
    const text = cached('relative', locale, (l) => new Intl.RelativeTimeFormat(l, { numeric: 'auto' })).format(0, 'second');
    return { text, spoken: text };
  }
  if (seconds < 7 * 86400) {
    const [unit, size] =
      seconds < 3600 ? (['minute', 60] as const) : seconds < 86400 ? (['hour', 3600] as const) : (['day', 86400] as const);
    const amount = Math.floor(seconds / size);
    const text = numberFormat(locale, `age:${unit}`, { style: 'unit', unit, unitDisplay: 'narrow' }).format(amount);
    // `numeric: 'always'` keeps "1 day ago" instead of "yesterday", matching the "1d" on screen.
    const spoken = cached('relative-always', locale, (l) => new Intl.RelativeTimeFormat(l, { numeric: 'always' })).format(
      -amount,
      unit,
    );
    return { text, spoken };
  }
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  const text = dateFormat(
    locale,
    sameYear ? 'short' : 'short-year',
    { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) },
    timeZone,
  ).format(time);
  return { text, spoken: text };
}

/**
 * The date of `input` with its year ("Mar 4, 2026"), or null for invalid dates. Unlike an age it does not depend on
 * when it is rendered, so it is what the server prints for a relative time: a cached page hydrates without a mismatch.
 */
export function formatStaticDate(input: DateInput, locale?: string, timeZone?: string): string | null {
  const time = toTime(input);
  if (Number.isNaN(time)) return null;
  return dateFormat(locale, 'short-year', { month: 'short', day: 'numeric', year: 'numeric' }, timeZone).format(time);
}

/** Attributes for a <time> element: machine-readable value and a full-date tooltip. */
export function timeAttributes(input: DateInput, locale?: string, timeZone?: string) {
  const time = toTime(input);
  if (Number.isNaN(time)) return {};
  return {
    dateTime: new Date(time).toISOString(),
    title: dateFormat(locale, 'full', { dateStyle: 'medium', timeStyle: 'short' }, timeZone).format(time),
  };
}

export function formatMonthYear(input: DateInput, locale?: string, timeZone?: string) {
  const time = toTime(input);
  return Number.isNaN(time) ? '' : dateFormat(locale, 'month-year', { month: 'long', year: 'numeric' }, timeZone).format(time);
}

/** Whole-percent saving of `price` against `compareAtPrice`; 0 when there is no saving. */
export function discountPercent(price: number, compareAtPrice: number | undefined) {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

/**
 * Roving-focus target for arrow keys. Without `columns` it is a 1-D list where
 * both arrow axes move; with `columns` up/down jump a row and stop at the edges.
 * Left/Right follow the reading direction: in RTL, ArrowLeft moves to the next item.
 */
export function moveIndex(
  key: string,
  index: number,
  count: number,
  columns?: number,
  direction: Direction = 'ltr',
): number | null {
  if (count === 0) return null;
  const wrap = (i: number) => (i + count) % count;
  switch (key) {
    case 'ArrowRight':
    case 'ArrowLeft':
      return wrap(index + inlineArrowStep(key, direction));
    case 'ArrowDown':
      if (columns === undefined) return wrap(index + 1);
      return index + columns < count ? index + columns : index;
    case 'ArrowUp':
      if (columns === undefined) return wrap(index - 1);
      return index - columns >= 0 ? index - columns : index;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/**
 * Count shown next to a toggle (likes, followers). The server count already
 * includes the viewer's state at the time it was fetched, so only the change
 * since then is applied; a new `count` prop resets that baseline.
 */
export function useOptimisticCount(count: number, active: boolean) {
  const [base, setBase] = useState({ count, active });
  if (base.count !== count) {
    setBase({ count, active });
    return count;
  }
  return Math.max(0, base.count + Number(active) - Number(base.active));
}

/** Focuses a popup's content once it is visible. */
export function useFocusWhenOpen(open: boolean, getTarget: () => HTMLElement | null | undefined) {
  const target = useEventCallback(getTarget);
  useEffect(() => {
    if (!open) return;
    // Floating stays visibility:hidden until its first position pass, and hidden elements can't take focus.
    const frame = requestAnimationFrame(() => target()?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, target]);
}
