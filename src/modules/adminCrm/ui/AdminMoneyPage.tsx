import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { adminCrmClient, type AdminCrmClient } from '../api/adminCrmClient';
import '../adminCrm.css';
import '../adminMoney.css';
import { formatDate } from './adminClientCardModel';
import { MONEY_PERIODS, moneyCaveats, moneyRange, type MoneyPayload, type MoneyPeriodDays } from './moneyModel';
import { BuyersPanel, MoneyKpis, PlansPanel, RetentionPanel, RevenueChart } from './AdminMoneySections';

export type AdminMoneyPageProps = {
  client?: Pick<AdminCrmClient, 'money'>;
  /** Fixed clock for stories and tests. */
  now?: () => Date;
};

type MoneyState =
  | { status: 'loading'; payload: MoneyPayload | null }
  | { status: 'error'; message: string; payload: MoneyPayload | null }
  | { status: 'ready'; payload: MoneyPayload };

const systemNow = () => new Date();

export function AdminMoneyPage({ client = adminCrmClient, now = systemNow }: AdminMoneyPageProps) {
  const idPrefix = useId();
  const [days, setDays] = useState<MoneyPeriodDays>(30);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<MoneyState>({ status: 'loading', payload: null });

  useEffect(() => {
    const controller = new AbortController();
    setState(current => ({ status: 'loading', payload: 'payload' in current ? current.payload : null }));
    client.money(moneyRange(days, now()), controller.signal)
      .then(payload => setState({ status: 'ready', payload }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState(current => ({
          status: 'error',
          message: error instanceof Error ? error.message : 'Не удалось загрузить данные о деньгах',
          payload: 'payload' in current ? current.payload : null,
        }));
      });
    return () => controller.abort();
  }, [client, days, now, reloadKey]);

  const payload = state.payload;
  const caveats = payload ? moneyCaveats(payload) : [];
  return (
    <div className="admin-money" aria-busy={state.status === 'loading'}>
      <header className="admin-money-head">
        <div>
          <h2>Деньги</h2>
          <p>Подписки Boosty и Tribute, донаты и платные посты. {payload && `Обновлено ${formatDate(payload.generatedAt, true)}.`}</p>
        </div>
        <div className="admin-money-controls">
          <div role="group" aria-label="Период" className="admin-crm-segment-row">
            {MONEY_PERIODS.map(period => (
              <button key={period.days} type="button" className="admin-crm-segment" aria-pressed={days === period.days} onClick={() => setDays(period.days)}>
                {period.label}
              </button>
            ))}
          </div>
          <button type="button" className="contest-secondary-button" disabled={state.status === 'loading'} onClick={() => setReloadKey(key => key + 1)}>
            <RefreshCw size={16} aria-hidden="true" /> Обновить
          </button>
        </div>
      </header>

      {state.status === 'error' && (
        <p className="admin-money-alert" role="alert"><AlertTriangle size={18} aria-hidden="true" /> {state.message}</p>
      )}
      {!payload && state.status === 'loading' && <p className="admin-crm-muted" role="status">Считаем поступления…</p>}

      {payload && (
        <>
          {caveats.length > 0 && (
            <ul className="admin-money-caveats" aria-label="Полнота данных">
              {caveats.map(note => <li key={note}>{note}</li>)}
            </ul>
          )}
          <MoneyKpis payload={payload} />
          <div className="admin-money-grid">
            <RevenueChart idPrefix={idPrefix} payload={payload} />
            <PlansPanel idPrefix={idPrefix} payload={payload} />
            <RetentionPanel idPrefix={idPrefix} payload={payload} />
            <BuyersPanel idPrefix={idPrefix} payload={payload} />
          </div>
        </>
      )}
    </div>
  );
}
