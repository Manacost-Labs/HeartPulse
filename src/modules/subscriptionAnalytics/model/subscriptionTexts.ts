/**
 * Русские тексты для машинных кодов `unavailable[]` и `limitations[]` источника
 * (`app/subscription_metrics.py` в boosty-auth). Незнакомый код не роняет страницу.
 */
const UNAVAILABLE_TEXTS: Readonly<Record<string, string>> = {
  net_revenue: 'Чистая выручка недоступна: источник видит только рост счётчика платежей, без комиссий и возвратов.',
  exact_renewal_rate: 'Точная доля продлений недоступна: источник видит состояние подписчиков, а не каждый платёж.',
  acquisition_and_cac: 'Откуда пришли подписчики и сколько стоило их привлечение, источник не знает.',
};

const LIMITATION_TEXTS: Readonly<Record<string, string>> = {
  currency_assumed_rub: 'Все суммы считаются рублями.',
  counter_increases_are_observations: 'Деньги — это рост счётчика платежей подписчика между опросами, а не выписка по платежам.',
  cohorts_are_first_observed_paid: 'Когорта считается с момента, когда мы впервые увидели подписчика платным, а не с его первой подписки на Boosty.',
  retention_first_poll_within_24h: 'Удержание проверяется по первому опросу в течение суток после 30, 60 или 90 дней; если опроса не было, исход неизвестен и показан границами.',
  monthly_churn_uses_month_start_base: 'Отток месяца — доля подписчиков на начало месяца, которые к его концу ушли; пришедшие внутри месяца не входят в базу.',
  utc_calendar: 'Дни, недели и месяцы считаются по UTC, поэтому границы могут отличаться от московских.',
  poll_gaps: 'В данных есть перерывы в опросах Boosty: за это время изменения могли быть не замечены.',
  partial_months: 'Первый и текущий месяцы неполные: их цифры не сравнимы с полными месяцами.',
  window_clamped_to_baseline: 'Наблюдение началось позже запрошенного периода: график начинается с первого опроса.',
};

const FALLBACK_UNAVAILABLE = 'Этих данных источник пока не отдаёт.';
const FALLBACK_LIMITATION = 'К этим цифрам есть оговорка источника; подробности уточняйте у разработчиков.';

const own = (table: Readonly<Record<string, string>>, code: string): string | undefined =>
  Object.hasOwn(table, code) ? table[code] : undefined;

export const unavailableText = (code: string): string => own(UNAVAILABLE_TEXTS, code) ?? FALLBACK_UNAVAILABLE;
export const limitationText = (code: string): string => own(LIMITATION_TEXTS, code) ?? FALLBACK_LIMITATION;

export const KNOWN_UNAVAILABLE_CODES: readonly string[] = Object.keys(UNAVAILABLE_TEXTS);
export const KNOWN_LIMITATION_CODES: readonly string[] = Object.keys(LIMITATION_TEXTS);

/** Тексты по списку кодов; повтор и пустой код отбрасываются, порядок источника сохраняется. */
export function describeCodes(codes: readonly string[], kind: 'unavailable' | 'limitations'): Array<{ code: string; text: string }> {
  const describe = kind === 'unavailable' ? unavailableText : limitationText;
  return [...new Set(codes)].filter(Boolean).map(code => ({ code, text: describe(code) }));
}
