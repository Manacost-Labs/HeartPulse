import { pluralRu } from '../../../shared/text/pluralRu';
import { TableSurface } from '../../../shared/ui/analytics/TableSurface';
import { formatCount, formatPercent, formatRub } from '../model/subscriptionFormat';
import { limitationText } from '../model/subscriptionTexts';
import { formatMonthLabel } from '../model/subscriptionTiles';
import type { SubscriptionMetrics, SubscriptionMonth } from '../model/types';
import { Callout, Chip, NO_DATA, Section, Stat } from './SubscriptionBlockParts';

const CHURN_SCALE = 40;

function MonthName({ month }: { month: SubscriptionMonth }) {
  return <>{formatMonthLabel(month.month)}{month.partial && <> <Chip tone="warn">неполный</Chip></>}</>;
}

export function Churn({ metrics }: { metrics: SubscriptionMetrics }) {
  const { months } = metrics;
  const partialNames = months.filter(month => month.partial).map(month => formatMonthLabel(month.month));
  return <Section
    id="churn"
    title="Отток по месяцам"
    lead="Доля платных на начало месяца, у которых к концу месяца нет платного доступа. Пришедшие внутри месяца в базу не входят."
  >
    {months.length === 0 ? <p className="sa-empty">Месяцев в периоде нет: <span data-empty="">{NO_DATA}</span>.</p> : <TableSurface title="Отток по месяцам">
      <table className="sa-table">
        <thead><tr>
          <th scope="col">Месяц</th><th scope="col" className="is-numeric">Отток</th><th scope="col" className="is-numeric">На начало</th>
          <th scope="col" className="is-numeric">Ушли из них</th><th scope="col" className="is-numeric">Начали</th>
          <th scope="col" className="is-numeric">Закончили</th><th scope="col" className="is-numeric">На конец</th>
        </tr></thead>
        <tbody>{months.map(month => <tr key={month.month} data-partial={month.partial || undefined}>
          <th scope="row"><MonthName month={month} /></th>
          <td className="is-numeric sa-churn">
            {month.churnRate === null ? <span data-empty="">{NO_DATA}</span> : <>
              <strong>{formatPercent(month.churnRate)}</strong>
              <span className="sa-bar" aria-hidden="true" data-partial={month.partial || undefined}><i style={{ inlineSize: `${Math.min(100, month.churnRate / CHURN_SCALE * 100)}%` }} /></span>
            </>}
          </td>
          <td className="is-numeric">{formatCount(month.initial)}</td>
          <td className="is-numeric">{formatCount(month.lostInitial)}</td>
          <td className="is-numeric">{formatCount(month.accessStarts)}</td>
          <td className="is-numeric">{formatCount(month.accessEnds)}</td>
          <td className="is-numeric">{formatCount(month.closing)}</td>
        </tr>)}</tbody>
      </table>
    </TableSurface>}
    {partialNames.length > 0 && <p className="sa-note" data-testid="partial-months-note">
      {partialNames.length === 1 ? 'Месяц' : 'Месяцы'} {partialNames.join(' и ')} неполн{partialNames.length === 1 ? 'ый' : 'ые'}: период начинается или заканчивается внутри месяца, поэтому их нельзя сравнивать с полными напрямую.
    </p>}
  </Section>;
}

/* Деньги: только оценка. */
export function Money({ metrics }: { metrics: SubscriptionMetrics }) {
  const { moneyEstimate: money, months } = metrics;
  const notes = ['counter_increases_are_observations', 'currency_assumed_rub'].filter(code => metrics.limitations.includes(code));
  return <Section
    id="money"
    title="Денежная оценка (не выручка)"
    lead="Оценка по росту накопительного счётчика платежей подписчиков Boosty между опросами."
  >
    <Callout>
      <strong>Это оценка, а не выручка.</strong>{' '}
      В неё не входят комиссии, возвраты и выплаты.
      {notes.map(code => <span key={code} className="sa-callout__line">{limitationText(code)}</span>)}
    </Callout>
    <ul className="sa-stats" aria-label="Денежная оценка за период">
      <Stat label="Прирост счётчиков (оценка)" value={formatRub(money.counterIncreasesRub)} hint={`${formatCount(money.positiveChanges)} ${pluralRu(money.positiveChanges, 'прирост', 'прироста', 'приростов')} за период`} />
      <Stat label="Плательщиков" value={formatCount(money.observedPayers)} hint="У кого счётчик вырос за период" />
      <Stat label="ARPPU (оценка)" value={money.estimatedArppuRub === null ? NO_DATA : formatRub(money.estimatedArppuRub)} hint="Прирост на наблюдавшегося плательщика за весь период, поэтому выше месячных значений" />
      <Stat label="Уменьшений счётчика" value={formatCount(money.decreasesCount)} hint={money.decreasesCount > 0 ? `На ${formatRub(Math.abs(money.decreasesRub))} в сумме: в прирост не вошли` : 'Счётчик не уменьшался'} tone={money.decreasesCount > 0 ? 'down' : undefined} />
      <Stat label="Первых значений счётчика" value={formatCount(money.unattributedFirstCounters)} hint="Подписчики, впервые замеченные уже с ненулевым счётчиком: их сумма в прирост не вошла" />
    </ul>
    {months.length > 0 && <TableSurface title="Денежная оценка по месяцам">
      <table className="sa-table">
        <thead><tr>
          <th scope="col">Месяц</th><th scope="col" className="is-numeric">Прирост (оценка)</th>
          <th scope="col" className="is-numeric">Плательщиков</th><th scope="col" className="is-numeric">ARPPU (оценка)</th>
        </tr></thead>
        <tbody>{months.map(month => <tr key={month.month} data-partial={month.partial || undefined}>
          <th scope="row"><MonthName month={month} /></th>
          <td className="is-numeric">{formatRub(month.observedCounterIncreaseRub)}</td>
          <td className="is-numeric">{formatCount(month.observedPayers)}</td>
          <td className="is-numeric">{month.estimatedArppuRub === null ? <span data-empty="">{NO_DATA}</span> : formatRub(month.estimatedArppuRub)}</td>
        </tr>)}</tbody>
      </table>
    </TableSurface>}
    {months.some(month => month.partial) && <p className="sa-note">Неполные месяцы дают меньший прирост просто потому, что в них меньше дней, — не сравнивайте их с полными.</p>}
  </Section>;
}

/* Конверсия бесплатных в платных. */
export function Conversion({ metrics }: { metrics: SubscriptionMetrics }) {
  const { freeConversion: conversion, summary } = metrics;
  const lapsed = Math.max(0, conversion.everConverted - conversion.stillPaid);
  return <Section
    id="conversion"
    title="Конверсия бесплатных подписчиков в платных"
    lead="Из тех, кто в начале периода был подписан бесплатно: сколько хоть раз стали платить и сколько платят сейчас."
  >
    <ul className="sa-stats" aria-label="Конверсия за период">
      <Stat label="Бесплатных на начало" value={formatCount(conversion.initialFree)} />
      <Stat label="Хоть раз стали платными" value={formatCount(conversion.everConverted)} hint={lapsed > 0 ? `${formatCount(lapsed)} из них сейчас не платят` : undefined} />
      <Stat label="Платят сейчас" value={formatCount(conversion.stillPaid)} />
      <Stat label="Доля ставших платными" value={conversion.rate === null ? NO_DATA : formatPercent(conversion.rate)} hint="Хоть раз стали платными из бесплатных на начало" />
      <Stat label="Бесплатных сейчас" value={formatCount(summary.freeNow)} hint="Подписаны без оплаты: потенциал конверсии" />
    </ul>
  </Section>;
}

/** Все блоки среза 3: чистая функция ответа сервера, без запросов и таймеров. */
