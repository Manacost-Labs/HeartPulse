/** Thrown with the dotted path of the first field that fails validation. */
export class GameFieldError extends Error {
  constructor(readonly field: string) {
    super(`Invalid field ${field}`);
  }
}

export type JsonObject = Record<string, unknown>;

export const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,63}$/;
const CARD_ID_PATTERN = /^[A-Za-z0-9_]{2,64}$/;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function object(value: unknown, field: string): JsonObject {
  if (!isObject(value)) throw new GameFieldError(field);
  return value;
}

export function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new GameFieldError(field);
  }
  return value as number;
}

export function optionalInteger(value: unknown, field: string, minimum: number, maximum: number): number | null {
  return value === undefined || value === null ? null : integer(value, field, minimum, maximum);
}

export function optionalBoolean(value: unknown, field: string, fallback: boolean | null): boolean | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new GameFieldError(field);
  return value;
}

export function oneOf<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) throw new GameFieldError(field);
  return value as T;
}

export function pattern(value: unknown, field: string, expression: RegExp): string {
  if (typeof value !== 'string' || !expression.test(value)) throw new GameFieldError(field);
  return value;
}

export function cardId(value: unknown, field: string): string {
  return pattern(value, field, CARD_ID_PATTERN);
}

export function optionalCardId(value: unknown, field: string): string | null {
  return value === undefined || value === null ? null : cardId(value, field);
}

/** Free text from the client: trimmed, control characters refused, empty treated as absent. */
export function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null) return null;
  const control = (text: string) => [...text].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (typeof value !== 'string' || value.length > maximum || control(value)) {
    throw new GameFieldError(field);
  }
  const trimmed = value.trim();
  return trimmed || null;
}

export function list<T>(
  value: unknown,
  field: string,
  maximum: number,
  read: (item: unknown, itemField: string) => T,
): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maximum) throw new GameFieldError(field);
  return value.map((item, index) => read(item, `${field}.${index}`));
}
