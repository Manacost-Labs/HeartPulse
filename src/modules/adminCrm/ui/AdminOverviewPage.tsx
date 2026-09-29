import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { adminCrmClient, type AdminCrmClient, type AdminCrmSegmentId } from '../api/adminCrmClient';
import '../adminCrm.css';
import '../adminOverview.css';
import { AdminClientCard } from './AdminClientCard';
import { moneyRange, type MoneyPayload } from './moneyModel';
import { relativeTime, type AdminCrmOverview } from './overviewModel';
import { OverviewActivityFeed, OverviewAlerts, OverviewKpis, OverviewQuickActions } from './AdminOverviewSections';

export type AdminOverviewPageProps = {
  client?: Pick<AdminCrmClient, 'overview' | 'money'> & Partial<Pick<AdminCrmClient, 'person' | 'addNote' | 'deleteNote' | 'setTags'>>;
  onNavigate: (section: string) => void;
  onOpenSegment: (segment: AdminCrmSegmentId) => void;
};

type Load<T> = { status: 'loading' | 'ready' | 'error'; value: T | null; message?: string };

export function AdminOverviewPage({ client = adminCrmClient, onNavigate, onOpenSegment }: AdminOverviewPageProps) {
  const [overview, setOverview] = useState<Load<AdminCrmOverview>>({ status: 'loading', value: null });
  const [money, setMoney] = useState<Load<MoneyPayload>>({ status: 'loading', value: null });
  const [refresh, setRefresh] = useState(0);
  const [personId, setPersonId] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setOverview(current => ({ ...current, status: 'loading' }));
    client.overview(refresh > 0, controller.signal)
      .then(value => setOverview({ status: 'ready', value }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setOverview(current => ({ ...current, status: 'error', message: error instanceof Error ? error.message : 'Не удалось загрузить обзор' }));
      });
    // Revenue comes from the slower Boosty/Tribute analytics and must not hold back the alerts.
    client.money(moneyRange(30), controller.signal)
      .then(value => setMoney({ status: 'ready', value }))
      .catch(() => { if (!controller.signal.aborted) setMoney({ status: 'error', value: null }); });
    return () => controller.abort();
  }, [client, refresh]);

  const data = overview.value;
  const cardClient = client.person && client.addNote && client.deleteNote && client.setTags
    ? { person: client.person, addNote: client.addNote, deleteNote: client.deleteNote, setTags: client.setTags }
    : undefined;
  return (
    <div className="admin-overview" aria-busy={overview.status === 'loading'}>
      <header className="admin-overview-head">
        <div>
          <h2>Что происходит</h2>
          <p>{data ? `Данные на ${relativeTime(data.generatedAt)}` : 'Собираем данные…'}</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={overview.status === 'loading'} onClick={() => setRefresh(value => value + 1)}>
          <RefreshCw size={16} aria-hidden="true" /> Обновить
        </button>
      </header>
      {overview.status === 'error' && <p className="admin-money-alert" role="alert">{overview.message}</p>}
      {data && (
        <>
          <OverviewAlerts alerts={data.alerts} onNavigate={onNavigate} onOpenSegment={onOpenSegment} />
          <OverviewKpis overview={data} money={money.value} moneyFailed={money.status === 'error'} onNavigate={onNavigate} onOpenSegment={onOpenSegment} />
          <div className="admin-overview-grid">
            <OverviewActivityFeed overview={data} onOpenPerson={setPersonId} />
            <OverviewQuickActions onNavigate={onNavigate} />
          </div>
        </>
      )}
      {personId && <AdminClientCard userId={personId} client={cardClient} onClose={() => setPersonId('')} />}
    </div>
  );
}
