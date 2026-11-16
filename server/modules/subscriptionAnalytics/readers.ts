/** Источник ответил, но ответ не годится: форма не та или версия/семантика чужая. */
export class SubscriptionMetricsSourceError extends Error {
  constructor(message: string, readonly incompatible = false) {
    super(message);
    this.name = 'SubscriptionMetricsSourceError';
  }
}

export type Obj = Record<string, unknown>;

export const MAX_DAILY = 400;
export const MAX_WEEKLY = 70;
export const MAX_MONTHS = 16;
export const MAX_LIST = 200;
const MAX_CODES = 50;
const MAX_TEXT = 200;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_ONLY = /^\d{4}-\d{2}$/;

function fail(path: string, expected: string): never {
  throw new SubscriptionMetricsSourceError(`${path}: ожидалось ${expected}`);
}

export function obj(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'объект');
  return value as Obj;
}

export function list(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `массив не длиннее ${max}`);
  return value as unknown[];
}

export function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'число');
  return value as number;
}

export function count(value: unknown, path: string): number {
  const found = num(value, path);
  if (!Number.isInteger(found) || found < 0) fail(path, 'неотрицательное целое');
  return found;
}

export function int(value: unknown, path: string): number {
  const found = num(value, path);
  if (!Number.isInteger(found)) fail(path, 'целое');
  return found;
}

export const orNull = <T>(read: (value: unknown, path: string) => T) =>
  (value: unknown, path: string): T | null => (value === null ? null : read(value, path));

export function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value || value.length > MAX_TEXT) fail(path, 'непустая строка');
  return value as string;
}

export function moment(value: unknown, path: string): string {
  const found = text(value, path);
  if (!Number.isFinite(Date.parse(found))) fail(path, 'дата');
  return found;
}

/** Маски мало: `2026-02-30` Node молча сдвигает на 2 марта, а `2026-13` — не месяц. */
function calendar(re: RegExp, what: string, toDay: (found: string) => string) {
  return (value: unknown, path: string): string => {
    const found = text(value, path);
    const day = toDay(found);
    const parsed = re.test(found) ? new Date(`${day}T00:00:00Z`) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) fail(path, what);
    return found;
  };
}
export const dateOnly = calendar(DATE_ONLY, 'дата ГГГГ-ММ-ДД', found => found);
export const monthOnly = calendar(MONTH_ONLY, 'месяц ГГГГ-ММ', found => `${found}-01`);

export function flag(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'true/false');
  return value as boolean;
}

export function items<T>(value: unknown, path: string, max: number, read: (item: Obj, at: string) => T): T[] {
  return list(value, path, max).map((item, index) => read(obj(item, `${path}[${index}]`), `${path}[${index}]`));
}

export function codes(value: unknown, path: string): string[] {
  return list(value, path, MAX_CODES).map((code, index) => text(code, `${path}[${index}]`));
}

/** Карта «тариф → число»: ключи — только свои, `__proto__` из JSON не меняет прототип. */
export function countsByPlan(value: unknown, path: string): Record<string, number> {
  const source = obj(value, path);
  const keys = Object.keys(source);
  if (keys.length > MAX_LIST) fail(path, `не больше ${MAX_LIST} тарифов`);
  return Object.fromEntries(keys.map(key => [text(key, `${path} ключ`), count(source[key], `${path}.${key}`)]));
}
