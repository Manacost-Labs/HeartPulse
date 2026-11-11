import { EMPTY_VALUE, formatCount, formatPercent, formatRub, formatSignedCount } from './subscriptionFormat';
import { formatShortDate } from './subscriptionCharts';
import type {
  SubscriptionMetrics, SubscriptionNominalValue, SubscriptionPlanTransition, SubscriptionRetention, SubscriptionWeeklyPoint,
} from './types';

/** Когорта меньше этого числа людей — процент по ней сильно прыгает, и это надо видеть. */
export const SMALL_COHORT = 30;

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const pad = (value: number) => String(value).padStart(2, '0');

/** «11 сен, 21:56 UTC» (с годом, если нужен); пустое или битое значение — тире. */
export function formatMoment(iso: string | null, withYear = false): string {
  const ms = iso === null ? Number.NaN : Date.parse(iso);
  if (!Number.isFinite(ms)) return EMPTY_VALUE;
  const date = new Date(ms);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}${withYear ? ` ${date.getUTCFullYear()}` : ''}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** Часы с десятой, без «,0»: 96.5 → «96,5 ч», 114 → «114 ч». */
export function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return `${String(rounded).replace('.', ',')} ч`;
}

/** Рубли с копейками не нужны: «+14 ₽» / «−14 ₽» для разницы. */
export function formatSignedRub(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return `0 ₽`;
  return `${rounded > 0 ? '+' : '−'}${formatRub(Math.abs(rounded))}`;
}

export type TransitionKind = 'upgrade' | 'downgrade' | 'other';

const TRANSITION_LABELS: Record<TransitionKind, string> = { upgrade: 'Повышение', downgrade: 'Понижение', other: 'Другое' };
const TRANSITION_GLYPHS: Record<TransitionKind, string> = { upgrade: '↑', downgrade: '↓', other: '↔' };

/** Незнакомый вид перехода не роняет страницу: читается как «Другое». */
export function transitionKind(kind: string): TransitionKind {
  return kind === 'upgrade' || kind === 'downgrade' ? kind : 'other';
}
export const transitionLabel = (kind: string) => TRANSITION_LABELS[transitionKind(kind)];
export const transitionGlyph = (kind: string) => TRANSITION_GLYPHS[transitionKind(kind)];

/** Переходы по убыванию числа; при равенстве порядок источника сохраняется. */
export function sortedTransitions(rows: SubscriptionPlanTransition[]): SubscriptionPlanTransition[] {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => b.row.count - a.row.count || a.index - b.index).map(item => item.row);
}

export interface RetentionView {
  days: number;
  /** `null` — доли нет: «пока рано считать». */
  rate: number | null;
  rateText: string | null;
  /** Почему доли нет. */
  emptyReason: string | null;
  checked: string;
  /** Пояснение, если есть непроверенные (`unknown > 0`). */
  unknownNote: string | null;
  smallNote: string | null;
  /** Границы в процентах для полоски; `null`, когда неизвестных нет. */
  range: { lower: number; upper: number } | null;
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export function retentionView(row: SubscriptionRetention): RetentionView {
  const hasRange = row.unknown > 0 && row.lowerBound !== null && row.upperBound !== null;
  const emptyReason = row.rate !== null ? null
    : row.eligible === 0 ? `Пока никто из периода не дожил до ${row.days} дней.`
      : `Из ${formatCount(row.eligible)} человек проверить не удалось никого: годовщина попала на перерыв в опросах.`;
  return {
    days: row.days,
    rate: row.rate,
    rateText: row.rate === null ? null : formatPercent(row.rate),
    emptyReason,
    checked: `Проверено ${formatCount(row.evaluated)} из ${formatCount(row.eligible)} человек`,
    unknownNote: row.unknown > 0
      ? `Ещё ${formatCount(row.unknown)} не удалось проверить: ${row.days}-й день попал на перерыв в опросах, их нет в проценте.${hasRange ? ` Если все они ушли — ${formatPercent(row.lowerBound!)}, если все остались — ${formatPercent(row.upperBound!)}.` : ''}`
      : null,
    smallNote: row.eligible > 0 && row.eligible < SMALL_COHORT
      ? `Когорта из ${formatCount(row.eligible)} человек: процент может заметно измениться.`
      : null,
    range: hasRange ? { lower: clampPercent(row.lowerBound!), upper: clampPercent(row.upperBound!) } : null,
  };
}

export interface BaseValueView {
  start: SubscriptionNominalValue;
  end: SubscriptionNominalValue;
  deltaSubscribers: number;
  deltaValueRub: number;
  deltaAverageRub: number | null;
  /** Заголовок вывода и его пояснение; `null`, когда вывода нет (нет средних). */
  takeaway: { tone: 'down' | 'up'; headline: string; detail: string } | null;
}

/**
 * Стоимость базы по ценам тарифов в начале и в конце периода. Главный вывод — движение среднего тарифа:
 * «прирост стоит в среднем N ₽» считается из разницы номиналов и верен, только если цены всех известны.
 */
export function baseValueView(metrics: SubscriptionMetrics): BaseValueView {
  const { start, end } = metrics.nominalTariffValue;
  const deltaSubscribers = end.subscribers - start.subscribers;
  const deltaValueRub = end.tariffValueRub - start.tariffValueRub;
  const deltaAverageRub = start.averageTariffRub === null || end.averageTariffRub === null ? null : end.averageTariffRub - start.averageTariffRub;
  let takeaway: BaseValueView['takeaway'] = null;
  if (start.averageTariffRub !== null && end.averageTariffRub !== null && deltaAverageRub !== null && Math.round(deltaAverageRub) !== 0) {
    const down = deltaAverageRub < 0;
    const headline = `Средний тариф ${down ? 'снизился' : 'вырос'}: ${formatRub(start.averageTariffRub)} → ${formatRub(end.averageTariffRub)} (${formatSignedRub(deltaAverageRub)})`;
    const pricesKnown = start.unknownPrices === 0 && end.unknownPrices === 0;
    let detail = 'Стоимость считается по ценам тарифов, а не по платежам.';
    if (pricesKnown && deltaSubscribers > 0) {
      const added = deltaValueRub / deltaSubscribers;
      detail = `Каждый добавившийся подписчик в среднем приносит тариф ${formatRub(added)} в месяц — ${added < start.averageTariffRub ? 'ниже' : 'выше'} прежнего среднего, поэтому средний тариф ${down ? 'снижается' : 'растёт'}${deltaValueRub > 0 ? `, хотя вся база выросла на ${formatRub(deltaValueRub)} в месяц` : ''}.`;
    }
    takeaway = { tone: down ? 'down' : 'up', headline, detail };
  }
  return { start, end, deltaSubscribers, deltaValueRub, deltaAverageRub, takeaway };
}

/** «Было → стало»: подписчики тарифа на начало и конец периода и разница. */
export const planChange = (start: number, current: number) => formatSignedCount(current - start);

/** Подпись под графиком недель: что за неполные недели нарисованы и почему они неполные. */
export function partialWeekNotes(weekly: SubscriptionWeeklyPoint[]): string[] {
  const notes: string[] = [];
  weekly.forEach((week, index) => {
    if (!week.partial) return;
    const name = `Неделя с ${formatShortDate(week.weekStart)}`;
    if (index === weekly.length - 1) notes.push(`${name} ещё не закончилась: её числа неполные и вырастут.`);
    else if (index === 0) notes.push(`${name} неполная: период начинается в середине недели, поэтому её числа занижены и несравнимы с полными неделями.`);
    else notes.push(`${name} неполная: её числа несравнимы с полными неделями.`);
  });
  return notes;
}
