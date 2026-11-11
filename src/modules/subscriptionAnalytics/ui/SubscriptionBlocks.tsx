import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { TableSurface } from '../../../shared/ui/analytics/TableSurface';
import '../../../shared/ui/analytics/Analytics.css';
import { pluralRu } from '../../../shared/text/pluralRu';
import {
  baseValueView, planChange, retentionView, sortedTransitions, transitionGlyph, transitionKind, transitionLabel,
  type RetentionView,
} from '../model/subscriptionBlocks';
import { EMPTY_VALUE, formatCount, formatPercent, formatRub } from '../model/subscriptionFormat';
import { formatMonthLabel } from '../model/subscriptionTiles';
import { limitationText } from '../model/subscriptionTexts';
import type { SubscriptionMetrics, SubscriptionMonth } from '../model/types';
import { SubscriptionLimits } from './SubscriptionLimits';

const NO_DATA = 'нет данных';

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return <section className="sa-section" aria-labelledby={`sa-${id}-title`} data-section={id}>
    <header className="sa-section__head">
      <h3 id={`sa-${id}-title`}>{title}</h3>
      {lead && <p>{lead}</p>}
    </header>
    {children}
  </section>;
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'up' | 'down' }) {
  return <li className="sa-stat">
    <span className="sa-stat__label">{label}</span>
    <strong className="sa-stat__value" data-tone={tone} data-empty={value === NO_DATA || undefined}>{value}</strong>
    {hint && <small className="sa-stat__hint">{hint}</small>}
  </li>;
}

const Chip = ({ tone, children }: { tone: 'warn' | 'ok' | 'muted'; children: ReactNode }) => <span className="sa-chip" data-tone={tone}>{children}</span>;

function Callout({ tone = 'warn', children }: { tone?: 'warn' | 'info'; children: ReactNode }) {
  return <div className="sa-callout" data-tone={tone}><Info size={16} aria-hidden="true" /><div>{children}</div></div>;
}

/* Стоимость базы по ценам тарифов: начало против конца периода. */
function BaseValue({ metrics }: { metrics: SubscriptionMetrics }) {
  const view = baseValueView(metrics);
  const card = (name: string, value: typeof view.start) => <li className="sa-compare__card">
    <span className="sa-stat__label">{name}</span>
    <strong className="sa-stat__value">{formatRub(value.tariffValueRub)}<small> в месяц</small></strong>
    <dl>
      <div><dt>Платных подписчиков</dt><dd>{formatCount(value.subscribers)}</dd></div>
      <div><dt>Средний тариф</dt><dd>{value.averageTariffRub === null ? EMPTY_VALUE : formatRub(value.averageTariffRub)}</dd></div>
    </dl>
    {value.unknownPrices > 0 && <small className="sa-stat__hint">Цена тарифа неизвестна у {formatCount(value.unknownPrices)} {pluralRu(value.unknownPrices, 'подписчика', 'подписчиков', 'подписчиков')}: они не вошли в сумму.</small>}
  </li>;
  return <Section
    id="base-value"
    title="Стоимость базы по ценам тарифов"
    lead="Сумма цен тарифов у платных подписчиков: сколько в месяц стоила бы база по прайсу. Это номинал, а не платежи."
  >
    {view.takeaway && <div className="sa-takeaway" data-tone={view.takeaway.tone} data-testid="base-value-takeaway">
      <strong>{view.takeaway.headline}</strong>
      <span>{view.takeaway.detail}</span>
    </div>}
    <ul className="sa-compare" aria-label="Начало и конец периода">
      {card('Начало периода', view.start)}
      <li className="sa-compare__arrow" aria-hidden="true">→</li>
      {card('Конец периода', view.end)}
    </ul>
  </Section>;
}

/* Тарифы. */
function Plans({ metrics }: { metrics: SubscriptionMetrics }) {
  const { plans } = metrics;
  return <Section
    id="plans"
    title="Тарифы"
    lead="«Пришли» и «ушли» — начало и окончание платного доступа на тарифе; «перешли» — смена тарифа внутри платной подписки."
  >
    {plans.length === 0 ? <p className="sa-empty">За период тарифов нет.</p> : <TableSurface title="Тарифы">
      <table className="sa-table">
        <thead><tr>
          <th scope="col">Тариф</th><th scope="col" className="is-numeric">Цена</th><th scope="col" className="is-numeric">Было</th>
          <th scope="col" className="is-numeric">Стало</th><th scope="col" className="is-numeric">Изменение</th>
          <th scope="col" className="is-numeric">Пришли</th><th scope="col" className="is-numeric">Ушли</th>
          <th scope="col" className="is-numeric">Перешли в</th><th scope="col" className="is-numeric">Перешли из</th>
        </tr></thead>
        <tbody>{plans.map(plan => <tr key={plan.planName}>
          <th scope="row">{plan.planName}</th>
          <td className="is-numeric">{plan.priceRub === null ? EMPTY_VALUE : `${formatRub(plan.priceRub)}/мес`}</td>
          <td className="is-numeric">{formatCount(plan.start)}</td>
          <td className="is-numeric">{formatCount(plan.current)}</td>
          <td className="is-numeric" data-tone={plan.current > plan.start ? 'up' : plan.current < plan.start ? 'down' : undefined}>{planChange(plan.start, plan.current)}</td>
          <td className="is-numeric">{formatCount(plan.starts)}</td>
          <td className="is-numeric">{formatCount(plan.ends)}</td>
          <td className="is-numeric">{formatCount(plan.switchIn)}</td>
          <td className="is-numeric">{formatCount(plan.switchOut)}</td>
        </tr>)}</tbody>
      </table>
    </TableSurface>}
  </Section>;
}

/* Переходы между тарифами. */
function Transitions({ metrics }: { metrics: SubscriptionMetrics }) {
  const rows = sortedTransitions(metrics.planTransitions);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <Section
    id="transitions"
    title="Переходы между тарифами"
    lead={total > 0 ? `${formatCount(total)} ${pluralRu(total, 'переход', 'перехода', 'переходов')} за период между платными тарифами.` : undefined}
  >
    {rows.length === 0 ? <p className="sa-empty">За период смен тарифа среди платных подписчиков не было.</p> : <TableSurface title="Переходы между тарифами">
      <table className="sa-table">
        <thead><tr>
          <th scope="col">Из тарифа</th><th scope="col">В тариф</th><th scope="col">Вид</th><th scope="col" className="is-numeric">Человек</th>
        </tr></thead>
        <tbody>{rows.map(row => <tr key={`${row.fromPlan}→${row.toPlan}→${row.kind}`}>
          <th scope="row">{row.fromPlan}</th>
          <td>{row.toPlan}</td>
          <td><span className="sa-kind" data-kind={transitionKind(row.kind)}><span aria-hidden="true">{transitionGlyph(row.kind)}</span> {transitionLabel(row.kind)}</span></td>
          <td className="is-numeric">{formatCount(row.count)}</td>
        </tr>)}</tbody>
      </table>
    </TableSurface>}
  </Section>;
}

/* Удержание когорт. */
function Cohort({ view }: { view: RetentionView }) {
  return <li className="sa-cohort" data-days={view.days}>
    <span className="sa-stat__label">Через {view.days} дней</span>
    {view.rateText === null
      ? <strong className="sa-stat__value" data-empty="">пока рано считать</strong>
      : <strong className="sa-stat__value">{view.rateText}</strong>}
    <span className="sa-cohort__checked">{view.checked}</span>
    {view.rate !== null && <span className="sa-range" aria-hidden="true">
      {view.range && <i className="sa-range__band" style={{ insetInlineStart: `${view.range.lower}%`, inlineSize: `${view.range.upper - view.range.lower}%` }} />}
      <i className="sa-range__mark" style={{ insetInlineStart: `${Math.min(100, Math.max(0, view.rate))}%` }} />
    </span>}
    {view.emptyReason && <small className="sa-stat__hint">{view.emptyReason}</small>}
    {view.unknownNote && <small className="sa-stat__hint" data-testid="retention-unknown">{view.unknownNote}</small>}
    {view.smallNote && <small className="sa-cohort__small" data-testid="retention-small"><Chip tone="warn">Мало данных</Chip> {view.smallNote}</small>}
  </li>;
}

function Retention({ metrics }: { metrics: SubscriptionMetrics }) {
  const views = [...metrics.retention].sort((a, b) => a.days - b.days).map(retentionView);
  const base = metrics.originalBaseRetention;
  return <Section
    id="retention"
    title="Удержание когорт"
    lead="Когорта — те, кого мы впервые увидели платными в этом периоде (необязательно первые покупатели). Считаем, сколько из них платит спустя 30, 60 и 90 дней."
  >
    {views.length === 0 ? <p className="sa-empty">Для периода нет когорт, дошедших до 30 дней: <span data-empty="">{NO_DATA}</span>.</p>
      : <ul className="sa-cohorts" aria-label="Удержание через 30, 60 и 90 дней">{views.map(view => <Cohort key={view.days} view={view} />)}</ul>}
    {views.length > 0 && <p className="sa-note">
      Платный доступ проверяется по первому опросу в день N или позже, но не позже чем через сутки. Полоска: тёмная метка — доля, светлая область — границы, если непроверенные все ушли или все остались.
    </p>}
    <div className="sa-base-retention" data-testid="original-base-retention">
      <span className="sa-stat__label">Исходная база периода</span>
      {base.rate === null
        ? <strong className="sa-stat__value" data-empty="">{NO_DATA}</strong>
        : <strong className="sa-stat__value">{formatPercent(base.rate)}</strong>}
      <span>{base.initial > 0
        ? `${formatCount(base.retained)} из ${formatCount(base.initial)} платных на начало периода остались платными к его концу.`
        : 'На начало периода платных подписчиков не было.'}</span>
    </div>
  </Section>;
}

/* Отток по месяцам. */
const CHURN_SCALE = 40;

function MonthName({ month }: { month: SubscriptionMonth }) {
  return <>{formatMonthLabel(month.month)}{month.partial && <> <Chip tone="warn">неполный</Chip></>}</>;
}

function Churn({ metrics }: { metrics: SubscriptionMetrics }) {
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
          <th scope="col">Месяц</th><th scope="col" className="is-numeric">На начало</th><th scope="col" className="is-numeric">Ушли из них</th>
          <th scope="col" className="is-numeric">Отток</th><th scope="col" className="is-numeric">Начали</th>
          <th scope="col" className="is-numeric">Закончили</th><th scope="col" className="is-numeric">На конец</th>
        </tr></thead>
        <tbody>{months.map(month => <tr key={month.month} data-partial={month.partial || undefined}>
          <th scope="row"><MonthName month={month} /></th>
          <td className="is-numeric">{formatCount(month.initial)}</td>
          <td className="is-numeric">{formatCount(month.lostInitial)}</td>
          <td className="is-numeric sa-churn">
            {month.churnRate === null ? <span data-empty="">{NO_DATA}</span> : <>
              <strong>{formatPercent(month.churnRate)}</strong>
              <span className="sa-bar" aria-hidden="true" data-partial={month.partial || undefined}><i style={{ inlineSize: `${Math.min(100, month.churnRate / CHURN_SCALE * 100)}%` }} /></span>
            </>}
          </td>
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
function Money({ metrics }: { metrics: SubscriptionMetrics }) {
  const { moneyEstimate: money, months } = metrics;
  const notes = ['counter_increases_are_observations', 'currency_assumed_rub'].filter(code => metrics.limitations.includes(code));
  return <Section
    id="money"
    title="Денежная оценка (не выручка)"
    lead="Оценка по росту накопительного счётчика платежей подписчиков Boosty между опросами."
  >
    <Callout>
      <strong>Это оценка, а не выручка.</strong>{' '}
      В неё не входят комиссии, возвраты и выплаты, а счётчик видит не каждый платёж, а только его рост между опросами.
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
function Conversion({ metrics }: { metrics: SubscriptionMetrics }) {
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
export function SubscriptionBlocks({ metrics }: { metrics: SubscriptionMetrics }) {
  return <>
    <BaseValue metrics={metrics} />
    <Plans metrics={metrics} />
    <Transitions metrics={metrics} />
    <Retention metrics={metrics} />
    <Churn metrics={metrics} />
    <Money metrics={metrics} />
    <Conversion metrics={metrics} />
    <SubscriptionLimits metrics={metrics} />
  </>;
}

export function SubscriptionBlocksSkeleton() {
  return <div className="sa-more" aria-hidden="true">
    <div className="sa-skeleton sa-skeleton--block" />
    <div className="sa-skeleton sa-skeleton--block" />
  </div>;
}
