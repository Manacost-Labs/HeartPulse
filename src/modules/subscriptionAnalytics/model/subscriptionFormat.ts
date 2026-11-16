/**
 * Форматирование чисел раздела «Аналитика подписок». Группы цифр и пробел перед ₽ и % —
 * неразрывный U+00A0: `toLocaleString('ru-RU')` даёт U+202F, и Node с браузером расходятся.
 */
const NBSP = ' ';
const MINUS = '−';

function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

function decimal(value: number, digits: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(digits).split('.');
  return fraction ? `${groupDigits(Number(whole))},${fraction}` : groupDigits(Number(whole));
}

const sign = (value: number) => (value < 0 ? MINUS : '');

/** 1234 → «1 234». */
export function formatCount(value: number): string {
  return `${sign(Math.round(value))}${groupDigits(Math.abs(Math.round(value)))}`;
}

/** +123 → «+123», −5 → «−5», 0 → «0». */
export function formatSignedCount(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0';
  return `${rounded > 0 ? '+' : MINUS}${groupDigits(Math.abs(rounded))}`;
}

/** Рубли целыми: 79942 → «79 942 ₽». */
export function formatRub(value: number): string {
  const rounded = Math.round(value);
  return `${sign(rounded)}${groupDigits(Math.abs(rounded))}${NBSP}₽`;
}

/** Проценты с десятой: 72.4 → «72,4 %»; 100 → «100 %». */
export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${sign(rounded)}${decimal(rounded, Number.isInteger(rounded) ? 0 : 1)}${NBSP}%`;
}

/** Пустое значение (`null`) — тире, а не «0». */
export const EMPTY_VALUE = '—';
