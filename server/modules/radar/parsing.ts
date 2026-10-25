/** Примитивы разбора ответа hs-data-api: строгие типы, длины и даты в ISO. */
import { RADAR_CLASS_KEYS, type RadarClassKey } from './types.js';

const CLASS_ALIASES: Record<string, RadarClassKey> = { dk: 'deathknight', dh: 'demonhunter' };

export type Row = Record<string, unknown>;

/** Запись без обязательного поля: её разбор прерывается, а сама она выпадает. */
export class Skip extends Error {}

/** Ответ hs-data-api не похож на радар: последний хороший снимок остаётся в силе. */
export class RadarContractError extends Error {
  constructor(message: string) {
    super(`radar: ${message}`);
    this.name = 'RadarContractError';
  }
}

export function invalid(message: string): never {
  throw new RadarContractError(message);
}

export function record(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

export function text(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maximum) : null;
}

export function required(value: unknown, maximum: number): string {
  const result = text(value, maximum);
  if (result === null) throw new Skip();
  return result;
}

/** Любая принятая дата уходит дальше как ISO: её одинаково разбирают Node и все браузеры. */
export function date(value: unknown): string | null {
  const result = text(value, 40);
  const time = result ? Date.parse(result) : Number.NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function percent(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result >= 0 && result <= 100 ? Math.round(result * 100) / 100 : null;
}

export function count(value: unknown): number | null {
  const result = finite(value);
  return result !== null && result >= 0 ? Math.round(result) : null;
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function classKey(value: unknown): RadarClassKey {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if ((RADAR_CLASS_KEYS as readonly string[]).includes(normalized)) return normalized as RadarClassKey;
  return CLASS_ALIASES[normalized] ?? 'neutral';
}

/** Версия патча без номера сборки: «37.0.0.254477» → «37.0.0». */
export function patchVersion(value: unknown): string | null {
  const version = text(value, 40);
  return version ? version.split('.').slice(0, 3).join('.') : null;
}
