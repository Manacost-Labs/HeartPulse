import { TableSurface } from '../../../shared/ui/analytics/TableSurface';
import '../../../shared/ui/analytics/Analytics.css';
import { pluralRu } from '../../../shared/text/pluralRu';
import {
  baseValueView, planChange, retentionView, sortedTransitions, transitionGlyph, transitionKind, transitionLabel,
  type RetentionView,
} from '../model/subscriptionBlocks';
import { EMPTY_VALUE, formatCount, formatPercent, formatRub } from '../model/subscriptionFormat';
import type { SubscriptionMetrics } from '../model/types';
import { Chip, NO_DATA, Section } from './SubscriptionBlockParts';
import { SubscriptionLimits } from './SubscriptionLimits';
import { Churn, Conversion, Money } from './SubscriptionMonthBlocks';

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
    {(view.rate !== null || view.range) && <span className="sa-range" aria-hidden="true">
      {view.range && <i className="sa-range__band" style={{ insetInlineStart: `${view.range.lower}%`, inlineSize: `${view.range.upper - view.range.lower}%` }} />}
      {view.rate !== null && <i className="sa-range__mark" style={{ insetInlineStart: `${Math.min(100, Math.max(0, view.rate))}%` }} />}
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
