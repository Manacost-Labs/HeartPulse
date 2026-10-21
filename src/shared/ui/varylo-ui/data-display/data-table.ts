/** Pure sort / filter / format / paginate / selection helpers behind DataTable. */

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export function getCellValue(row: unknown, key: string): unknown {
  return row != null ? (row as Record<string, unknown>)[key] : undefined;
}

const collators = new Map<string, Intl.Collator>();

/** Natural-order text comparison in `locale` ("Ä" sorts by the language's rules), one collator per locale. */
function collatorFor(locale?: string) {
  const key = locale ?? '';
  let collator = collators.get(key);
  if (!collator) {
    collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
    collators.set(key, collator);
  }
  return collator;
}

function isEmpty(value: unknown) {
  return (
    value == null ||
    value === '' ||
    (typeof value === 'number' && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()))
  );
}

/** Orders two non-empty values: numbers, dates and booleans by value, everything else as natural-order text. */
export function compareValues(a: unknown, b: unknown, locale?: string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collatorFor(locale).compare(String(a), String(b));
}

export type ValueGetter<T> = (row: T, key: string) => unknown;

/** Stable sort; empty values always go last, whatever the direction. */
export function sortRows<T>(
  rows: readonly T[],
  sort: SortState | null,
  getValue: ValueGetter<T> = getCellValue,
  locale?: string,
): T[] {
  if (!sort) return rows.slice();
  const sign = sort.direction === 'asc' ? 1 : -1;
  // Read each value once: getters may be computed accessors.
  const keyed = rows.map((row, index) => ({ row, index, value: getValue(row, sort.key) }));
  keyed.sort((ra, rb) => {
    const aEmpty = isEmpty(ra.value);
    const bEmpty = isEmpty(rb.value);
    if (aEmpty || bEmpty) return aEmpty === bEmpty ? ra.index - rb.index : aEmpty ? 1 : -1;
    return compareValues(ra.value, rb.value, locale) * sign || ra.index - rb.index;
  });
  return keyed.map((entry) => entry.row);
}

/** Cycles a column through ascending → descending → unsorted. */
export function nextSort(current: SortState | null, key: string): SortState | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

export interface ValueFormatOptions {
  locale?: string;
  /** Text for `true` / `false`. */
  yes: string;
  no: string;
}

/**
 * Turns a raw cell value into display text: locale-aware numbers and dates,
 * Yes/No for booleans, comma-joined arrays. Empty values become ''.
 */
export function createValueFormatter({ locale, yes, no }: ValueFormatOptions) {
  const numberFormat = new Intl.NumberFormat(locale);
  const dateFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const format = (value: unknown): string => {
    if (isEmpty(value)) return '';
    if (typeof value === 'number' || typeof value === 'bigint') return numberFormat.format(value);
    if (value instanceof Date) return dateFormat.format(value);
    if (typeof value === 'boolean') return value ? yes : no;
    if (Array.isArray(value)) return value.map(format).filter(Boolean).join(', ');
    return String(value);
  };
  return format;
}

/**
 * Search text for a raw value: the display text plus raw forms people type
 * (1234 for "1,234", 2026-10-13 for "Oct 13, 2026").
 */
export function toSearchText(value: unknown, format: (value: unknown) => string): string {
  if (isEmpty(value)) return '';
  if (Array.isArray(value)) return value.map((item) => toSearchText(item, format)).join(' ');
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) return '';
  const shown = format(value);
  if (typeof value === 'number' || typeof value === 'bigint') return `${shown} ${String(value)}`;
  if (value instanceof Date) {
    const iso = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    return `${shown} ${iso}`;
  }
  return shown;
}

/** Lower-cased, whitespace-separated query terms. */
export function parseQuery(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Keeps rows where every term of `query` appears (case-insensitively) in the
 * row's search text. `getText` should return already lower-cased text.
 */
export function filterRows<T>(rows: readonly T[], query: string, getText: (row: T) => string): T[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return rows.slice();
  return rows.filter((row) => {
    const haystack = getText(row);
    return terms.every((term) => haystack.includes(term));
  });
}

export interface Page<T> {
  rows: T[];
  /** Zero-based page, clamped to the available range. */
  page: number;
  pageCount: number;
  /** Index of the first row on the page within all rows. */
  start: number;
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const safePage = Math.min(Math.max(0, Math.floor(page)), pageCount - 1);
  const start = safePage * size;
  return { rows: rows.slice(start, start + size), page: safePage, pageCount, start };
}

export type SelectionState = 'all' | 'some' | 'none';

/** Header-checkbox state for the given (visible) row ids. */
export function getSelectionState(ids: readonly string[], selected: readonly string[]): SelectionState {
  if (ids.length === 0) return 'none';
  const set = new Set(selected);
  const count = ids.reduce((n, id) => n + (set.has(id) ? 1 : 0), 0);
  if (count === 0) return 'none';
  return count === ids.length ? 'all' : 'some';
}

/** Header-checkbox toggle: deselects `ids` when all are selected, otherwise selects them. Other ids are kept. */
export function toggleAll(selected: readonly string[], ids: readonly string[]): string[] {
  if (getSelectionState(ids, selected) === 'all') {
    const remove = new Set(ids);
    return selected.filter((id) => !remove.has(id));
  }
  const set = new Set(selected);
  return [...selected, ...ids.filter((id) => !set.has(id))];
}

export function toggleOne(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
}

export interface VirtualWindow {
  /** First rendered row (inclusive). */
  start: number;
  /** Last rendered row (exclusive). */
  end: number;
}

/**
 * Rows to render for a scroll position, assuming every row is `rowHeight` tall.
 * `offset` is the height above the first row inside the scroller (the sticky header).
 */
export function getVirtualWindow(
  total: number,
  { scrollTop, viewportHeight, rowHeight, offset = 0, overscan = 6 }: {
    scrollTop: number;
    viewportHeight: number;
    rowHeight: number;
    offset?: number;
    overscan?: number;
  },
): VirtualWindow {
  if (total <= 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop - offset) / rowHeight);
  const start = Math.min(Math.max(0, first - overscan), total);
  const end = Math.min(total, first + Math.ceil(viewportHeight / rowHeight) + 1 + overscan);
  return { start, end: Math.max(start, end) };
}

/**
 * Row ranges to render, in order: the window, plus one row kept mounted outside it (the focused
 * row, so scrolling it away does not drop focus to the page). Gaps between ranges become spacers.
 */
export function windowRuns({ start, end }: VirtualWindow, keep = -1): Array<[number, number]> {
  const runs: Array<[number, number]> = start < end ? [[start, end]] : [];
  if (keep < 0 || (keep >= start && keep < end)) return runs;
  if (keep < start) runs.unshift([keep, keep + 1]);
  else runs.push([keep, keep + 1]);
  return runs;
}
