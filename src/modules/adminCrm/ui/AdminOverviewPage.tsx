import React, { useCallback, useRef, useState } from 'react';
import { useAdminResource } from '../../adminWorkspace/public';
import { OVERVIEW_KEY } from '../api/overviewPreload';
import { RefreshCw } from 'lucide-react';
import { LoadingSurface } from '../../../shared/ui/LoadingSurface';
import '../../../shared/ui/LoadingSurface.css';
import { adminCrmClient, type AdminCrmClient, type AdminCrmSegmentId } from '../api/adminCrmClient';
import '../adminCrm.css';
import '../adminOverview.css';
import { AdminClientCard } from './AdminClientCard';
import { relativeTime, type AdminCrmOverview } from './overviewModel';
import { OverviewActivityFeed, OverviewAlerts, OverviewCharts, OverviewKpis, OverviewQuickActions } from './AdminOverviewSections';

export type AdminOverviewPageProps = {
  client?: Pick<AdminCrmClient, 'overview'> & Partial<Pick<AdminCrmClient, 'person' | 'addNote' | 'deleteNote' | 'setTags'>>;
  onNavigate: (section: string) => void;
  onOpenSegment: (segment: AdminCrmSegmentId) => void;
};

const injectedClients = new WeakMap<object, string>();

/** The production client shares the tab-wide cache key; an injected client (stories) gets its own. */
function overviewKey(client: object): string {
  if (client === adminCrmClient) return OVERVIEW_KEY;
  let key = injectedClients.get(client);
  if (!key) {
    key = `admin-crm:overview:${Math.random().toString(36).slice(2)}`;
    injectedClients.set(client, key);
  }
  return key;
}

function OverviewRequestStatus({ overview, onRefresh }: {
  overview: ReturnType<typeof useAdminResource<AdminCrmOverview>>;
  onRefresh: () => void;
}) {
  const { data } = overview;
  return (
    <>
      <header className="admin-overview-head">
        <div>
          <h2>Сводка сайта</h2>
          <p>{data ? `Обновлено ${relativeTime(data.generatedAt)}` : overview.error ? 'Данные обзора недоступны' : 'Получаем показатели и события'}</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={overview.loading || overview.refreshing} onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden="true" /> {overview.refreshing ? 'Обновляем…' : 'Обновить'}
        </button>
      </header>
      {overview.error && (
        <div className="admin-overview-error" role="alert">
          <div>
            <strong>{overview.error.message || 'Не удалось загрузить обзор'}</strong>
            <p>{data ? 'Показаны последние полученные данные.' : 'Разделы сайта доступны через быстрые переходы и меню.'}</p>
          </div>
          <button type="button" className="contest-secondary-button" disabled={overview.loading || overview.refreshing} onClick={onRefresh}>Повторить загрузку</button>
        </div>
      )}
      {overview.loading && !data && (
        <LoadingSurface className="admin-overview-loading" label="Загружаем обзор" detail="Показатели, события и состояние интеграций" count={3} />
      )}
    </>
  );
}

export function AdminOverviewPage({ client = adminCrmClient, onNavigate, onOpenSegment }: AdminOverviewPageProps) {
  const [personId, setPersonId] = useState('');
  // «Обновить» skips the server's one-minute cache; opening the section again shows the cached answer at once.
  const freshRef = useRef(false);
  const load = useCallback(() => {
    const fresh = freshRef.current;
    freshRef.current = false;
    return client.overview(fresh);
  }, [client]);
  // Pinned per mount: a caller that rebuilds its client on every render must not start a new request each time.
  const [key] = useState(() => overviewKey(client));
  const overview = useAdminResource<AdminCrmOverview>(key, load);
  const refresh = () => {
    freshRef.current = true;
    void overview.reload();
  };

  const data = overview.data;
  const cardClient = client.person && client.addNote && client.deleteNote && client.setTags
    ? { person: client.person, addNote: client.addNote, deleteNote: client.deleteNote, setTags: client.setTags }
    : undefined;
  return (
    <div className="admin-overview">
      <OverviewRequestStatus overview={overview} onRefresh={refresh} />
      {data && (
        <>
          <section className="admin-overview-attention" aria-labelledby="admin-overview-attention" aria-busy={overview.refreshing}>
            <div className="admin-overview-section-head">
              <h3 id="admin-overview-attention">Требует внимания</h3>
              <span>{data.alerts.length ? `Сигналов: ${data.alerts.length}` : 'Нет предупреждений'}</span>
            </div>
            <OverviewAlerts alerts={data.alerts} onNavigate={onNavigate} onOpenSegment={onOpenSegment} />
          </section>
          <OverviewKpis overview={data} onOpenSegment={onOpenSegment} />
        </>
      )}
      <div className="admin-overview-grid">
        <OverviewQuickActions onNavigate={onNavigate} />
        {data && <OverviewActivityFeed overview={data} onOpenPerson={setPersonId} />}
      </div>
      {data && <OverviewCharts overview={data} />}
      {personId && <AdminClientCard userId={personId} client={cardClient} onClose={() => setPersonId('')} />}
    </div>
  );
}
