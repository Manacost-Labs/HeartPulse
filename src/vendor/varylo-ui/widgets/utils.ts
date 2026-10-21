/** Level of a component's own heading (h1–h6). */
export type WidgetHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** Semantic color of a value, badge or segment. */
export type WidgetTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

/** How a number is printed: plain, money, a share of one (0.24 → 24%) or compact (12.8K). */
export type NumberFormat = 'number' | 'currency' | 'percent' | 'compact';

export interface FormatNumberOptions {
  format?: NumberFormat;
  /** ISO 4217 code for `currency` (default USD). */
  currency?: string;
  /** Fixed number of fraction digits; by default the format decides (2 for most currencies, 0 for JPY). */
  fractionDigits?: number;
  /** `exceptZero` prints "+12" and "−12" but a bare "0". */
  signDisplay?: Intl.NumberFormatOptions['signDisplay'];
  /** Raw Intl options, applied last. */
  options?: Intl.NumberFormatOptions;
}

const formats = new Map<string, Intl.NumberFormat>();

function intlOptions({ format = 'number', currency = 'USD', fractionDigits, signDisplay, options }: FormatNumberOptions): Intl.NumberFormatOptions {
  const base: Intl.NumberFormatOptions =
    format === 'currency'
      ? { style: 'currency', currency }
      : format === 'percent'
        ? { style: 'percent', maximumFractionDigits: 1 }
        : format === 'compact'
          ? { notation: 'compact', maximumFractionDigits: 1 }
          : { maximumFractionDigits: 2 };
  if (fractionDigits !== undefined) {
    base.minimumFractionDigits = fractionDigits;
    base.maximumFractionDigits = fractionDigits;
  }
  if (signDisplay) base.signDisplay = signDisplay;
  return { ...base, ...options };
}

/** A cached Intl.NumberFormat for the options; currency + compact print "$12.8K". */
export function numberFormat(locale: string | undefined, opts: FormatNumberOptions = {}) {
  const resolved = intlOptions(opts);
  if (opts.format === 'compact' && opts.currency) Object.assign(resolved, { style: 'currency', currency: opts.currency });
  const key = `${locale ?? ''}|${JSON.stringify(resolved)}`;
  let format = formats.get(key);
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, resolved);
    } catch {
      // An unknown currency code or option: fall back to plain digits rather than crash a dashboard.
      format = new Intl.NumberFormat(locale);
    }
    formats.set(key, format);
  }
  return format;
}

export function formatNumber(value: number, locale?: string, opts?: FormatNumberOptions) {
  return Number.isFinite(value) ? numberFormat(locale, opts).format(value) : '';
}

/** Default series colors: the theme's chart palette, in order. */
export const chartColor = (index: number) => `var(--ui-chart-${(index % 8) + 1})`;

/** Share of `value` in `total` as 0…1, safe for zero or negative totals. */
export function share(value: number, total: number) {
  if (!(total > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / total));
}
