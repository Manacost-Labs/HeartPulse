import React from 'react';
import { formatDate } from './adminClientCardModel';
import {
  formatRub,
  moneySummary,
  planShare,
  revenueBuckets,
  type MoneyPayload,
} from './moneyModel';

function Panel({ id, title, children, wide = false }: { id: string; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`admin-money-panel${wide ? ' is-wide' : ''}`} aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      {children}
    </section>
  );
}

export function MoneyKpis({ payload }: { payload: MoneyPayload }) {
  const summary = moneySummary(payload);
  // Without the sales ledger a zero would read as "no sales"; show the gap instead.
  const salesKnown = payload.sales !== null;
  const cards = [
    { label: 'Получено всего', value: formatRub(summary.totalRub), detail: `подписки ${formatRub(summary.subscriptionRub)} · продажи ${salesKnown ? formatRub(summary.salesRub) : 'нет данных'}` },
    { label: 'Новые подписки', value: summary.newSubscriptions.toLocaleString('ru-RU'), detail: `и ${summary.renewals.toLocaleString('ru-RU')} продлений` },
    { label: 'Средний платёж', value: summary.averagePaymentRub === null ? '—' : formatRub(summary.averagePaymentRub), detail: 'за подписку или продление' },
    { label: 'Донаты и посты', value: salesKnown ? formatRub(summary.salesRub) : '—', detail: salesKnown ? `${summary.buyers.toLocaleString('ru-RU')} покупателей` : 'данные продаж недоступны' },
  ];
  return (
    <dl className="admin-money-kpis" aria-label="Главные цифры за период">
      {cards.map(card => (
        <div key={card.label}>
          <dt>{card.label}</dt>
          <dd><strong>{card.value}</strong><small>{card.detail}</small></dd>
        </div>
      ))}
      {summary.decreaseRub > 0 && (
        <div className="is-negative">
          <dt>Снижения</dt>
          <dd><strong>−{formatRub(summary.decreaseRub)}</strong><small>возвраты и понижения уровня</small></dd>
        </div>
      )}
    </dl>
  );
}

export function RevenueChart({ idPrefix, payload }: { idPrefix: string; payload: MoneyPayload }) {
  const buckets = revenueBuckets(payload);
  const max = Math.max(1, ...buckets.map(bucket => bucket.subscriptionRub + bucket.salesRub));
  const label = (start: string) => formatDate(start).replace(/ г\.$/, '');
  return (
    <Panel id={`${idPrefix}-chart`} title="Поступления по периодам" wide>
      <div className="admin-money-legend" aria-hidden="true"><span className="is-subscriptions">Подписки</span><span className="is-sales">Донаты и посты</span></div>
      <ol className="admin-money-bars" aria-label="Поступления по периодам">
        {buckets.map(bucket => {
          const total = bucket.subscriptionRub + bucket.salesRub;
          return (
            <li key={bucket.start} aria-label={`${label(bucket.start)}: ${formatRub(total)}`} title={`${label(bucket.start)}: ${formatRub(total)}`}>
              <span className="is-sales" style={{ height: `${(bucket.salesRub / max) * 100}%` }} />
              <span className="is-subscriptions" style={{ height: `${(bucket.subscriptionRub / max) * 100}%` }} />
            </li>
          );
        })}
      </ol>
      {buckets.length > 0 && (
        <div className="admin-money-axis" aria-hidden="true">
          <span>{label(buckets[0].start)}</span><span>макс. {formatRub(max)}</span><span>{label(buckets[buckets.length - 1].start)}</span>
        </div>
      )}
    </Panel>
  );
}

export function PlansPanel({ idPrefix, payload }: { idPrefix: string; payload: MoneyPayload }) {
  const plans = planShare(payload.plans);
  return (
    <Panel id={`${idPrefix}-plans`} title="Уровни подписки">
      {plans.length ? (
        <ul className="admin-money-plans">
          {plans.map(plan => (
            <li key={`${plan.source}-${plan.planId}`}>
              <div><strong>{plan.planName}</strong><span>{plan.source === 'tribute' ? 'Tribute' : 'Boosty'} · {plan.newSubscriptions} новых · {plan.renewals} продлений</span></div>
              <b>{formatRub(plan.revenueRub)}</b>
              <i aria-hidden="true"><span style={{ width: `${Math.round(plan.share * 100)}%` }} /></i>
            </li>
          ))}
        </ul>
      ) : <p className="admin-crm-muted">За период платежей по уровням не было.</p>}
    </Panel>
  );
}

export function RetentionPanel({ idPrefix, payload }: { idPrefix: string; payload: MoneyPayload }) {
  return (
    <Panel id={`${idPrefix}-retention`} title="Удержание">
      {payload.retention.length ? (
        <dl className="admin-money-retention">
          {payload.retention.map(item => (
            <div key={item.days}>
              <dt>Через {item.days} дней</dt>
              <dd>
                <strong>{item.rate === null ? '—' : `${Math.round(item.rate * 100)}%`}</strong>
                <small>{item.retained} из {item.evaluated} продлили{item.unknown ? ` · ${item.unknown} неизвестно` : ''}</small>
              </dd>
            </div>
          ))}
        </dl>
      ) : <p className="admin-crm-muted">Пока мало данных, чтобы посчитать удержание.</p>}
    </Panel>
  );
}

export function BuyersPanel({ idPrefix, payload }: { idPrefix: string; payload: MoneyPayload }) {
  const buyers = [...(payload.sales?.buyers ?? [])].sort((left, right) => right.totalRevenueRub - left.totalRevenueRub).slice(0, 8);
  const transactions = (payload.sales?.transactions ?? []).slice(0, 8);
  return (
    <>
      <Panel id={`${idPrefix}-buyers`} title="Топ покупателей Boosty">
        {buyers.length ? (
          <ol className="admin-money-list">
            {buyers.map(buyer => (
              <li key={buyer.userId}>
                <div><strong>{buyer.name || buyer.email || buyer.userId}</strong><span>{buyer.donations} донатов · {buyer.postPurchases} постов · последний {formatDate(buyer.lastPurchaseAt)}</span></div>
                <b>{formatRub(buyer.totalRevenueRub)}</b>
              </li>
            ))}
          </ol>
        ) : <p className="admin-crm-muted">{payload.sales ? 'Покупок за период нет.' : 'Данные продаж недоступны.'}</p>}
      </Panel>
      <Panel id={`${idPrefix}-recent`} title="Последние продажи">
        {transactions.length ? (
          <ol className="admin-money-list">
            {transactions.map(item => (
              <li key={item.eventKey}>
                <div><strong>{item.user.name || item.user.email || 'Покупатель'}</strong><span>{item.type === 'donation' ? 'Донат' : `Пост «${item.post?.title ?? 'без названия'}»`} · {formatDate(item.createdAt, true)}</span></div>
                <b>{formatRub(item.amountRub)}</b>
              </li>
            ))}
          </ol>
        ) : <p className="admin-crm-muted">{payload.sales ? 'Продаж за период нет.' : 'Данные продаж недоступны.'}</p>}
      </Panel>
    </>
  );
}
