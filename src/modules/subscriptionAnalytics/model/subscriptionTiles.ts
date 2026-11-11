import type { SubscriptionMetrics } from './types';
import { EMPTY_VALUE, formatCount, formatPercent, formatRub, formatSignedCount } from './subscriptionFormat';

export type SubscriptionTileId =
  | 'paidNow'
  | 'netChange'
  | 'newStarts'
  | 'returnedStarts'
  | 'endsToFree'
  | 'endsLeft'
  | 'retention30'
  | 'lastFullMonthChurn'
  | 'nominalValue'
  | 'averageTariff';

export interface SubscriptionTile {
  id: SubscriptionTileId;
  label: string;
  /** Число плитки; `null` — источник значения не дал. */
  value: number | null;
  /** Готовая подпись: числа с неразрывными пробелами, пустое значение — тире. */
  text: string;
  /** Пояснение под значением. */
  hint: string;
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** «2026-10» → «октябрь 2026»; нераспознанное возвращается как есть. */
export function formatMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  const name = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && name ? `${name} ${match[1]}` : month;
}

/** Последний полный (не `partial`) месяц окна: по нему считается отток плитки. */
export function lastFullMonth(metrics: SubscriptionMetrics) {
  return [...metrics.months].reverse().find(month => !month.partial) ?? null;
}

function rateTile(id: SubscriptionTileId, label: string, rate: number | null, hint: string): SubscriptionTile {
  return { id, label, value: rate, text: rate === null ? EMPTY_VALUE : formatPercent(rate), hint };
}

/** Плитки сводки раздела «Аналитика подписок» (чистая функция ответа сервера). */
export function buildSubscriptionTiles(metrics: SubscriptionMetrics): SubscriptionTile[] {
  const { summary, nominalTariffValue } = metrics;
  const retention30 = metrics.retention.find(row => row.days === 30) ?? null;
  const month = lastFullMonth(metrics);
  const retentionHint = !retention30
    ? 'Нет данных за 30 дней'
    : retention30.lowerBound !== null && retention30.upperBound !== null && retention30.unknown > 0
      ? `Оценено ${formatCount(retention30.evaluated)} из ${formatCount(retention30.eligible)}; между ${formatPercent(retention30.lowerBound)} и ${formatPercent(retention30.upperBound)}`
      : `Оценено ${formatCount(retention30.evaluated)} из ${formatCount(retention30.eligible)}`;
  const end = nominalTariffValue.end;
  return [
    { id: 'paidNow', label: 'Платных сейчас', value: summary.paidNow, text: formatCount(summary.paidNow), hint: `В начале периода: ${formatCount(summary.paidStart)}` },
    { id: 'netChange', label: 'Изменение за период', value: summary.netChange, text: formatSignedCount(summary.netChange), hint: `Бесплатных сейчас: ${formatCount(summary.freeNow)}` },
    { id: 'newStarts', label: 'Новые', value: summary.newStarts, text: formatCount(summary.newStarts), hint: 'Впервые замечены платными' },
    { id: 'returnedStarts', label: 'Вернувшиеся', value: summary.returnedStarts, text: formatCount(summary.returnedStarts), hint: 'Платили раньше, подписались снова' },
    { id: 'endsToFree', label: 'Ушли на бесплатный', value: summary.endsToFree, text: formatCount(summary.endsToFree), hint: 'Остались подписчиками без платы' },
    { id: 'endsLeft', label: 'Ушли совсем', value: summary.endsLeft, text: formatCount(summary.endsLeft), hint: 'Отписались полностью' },
    rateTile('retention30', 'Удержание 30 дней', retention30?.rate ?? null, retentionHint),
    rateTile(
      'lastFullMonthChurn',
      month ? `Отток, ${formatMonthLabel(month.month)}` : 'Отток последнего полного месяца',
      month?.churnRate ?? null,
      month ? `Ушли ${formatCount(month.lostInitial)} из ${formatCount(month.initial)} на начало месяца` : 'Полного месяца в периоде ещё нет',
    ),
    { id: 'nominalValue', label: 'Номинальная стоимость базы', value: end.tariffValueRub, text: formatRub(end.tariffValueRub), hint: `По ценам тарифов, ${formatCount(end.subscribers)} подписчиков` },
    {
      id: 'averageTariff',
      label: 'Средний тариф',
      value: end.averageTariffRub,
      text: end.averageTariffRub === null ? EMPTY_VALUE : formatRub(end.averageTariffRub),
      hint: end.unknownPrices > 0 ? `Цена неизвестна у ${formatCount(end.unknownPrices)}` : 'На одного платного подписчика',
    },
  ];
}
