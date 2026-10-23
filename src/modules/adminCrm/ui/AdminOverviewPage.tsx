import React, { useCallback, useRef, useState } from 'react';
import { useAdminResource } from '../../adminWorkspace/public';
import { OVERVIEW_KEY } from '../api/overviewPreload';
import { RefreshCw } from 'lucide-react';
import { adminCrmClient, type AdminCrmClient, type AdminCrmSegmentId } from '../api/adminCrmClient';
import '../adminCrm.css';
import '../adminOverview.css';
import { AdminClientCard } from './AdminClientCard';
import { relativeTime, type AdminCrmOverview } from './overviewModel';
import { OverviewActivityFeed, OverviewAlerts, OverviewKpis, OverviewQuickActions } from './AdminOverviewSections';

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

export function AdminOverviewPage({ client = adminCrmClient, onNavigate, onOpenSegment }: AdminOverviewPageProps) {
  const [personId, setPersonId] = useState('');
  // «Обновить» skips the server's one-minute cache; opening the section again shows the cached answer at once.
  const freshRef = useRef(false);
  const load = useCallback(() => {
    const fresh = freshRef.current;
    freshRef.current = false;
    return client.overview(fresh);
  }, [client]);
  const overview = useAdminResource<AdminCrmOverview>(overviewKey(client), load);
  const refresh = () => {
    freshRef.current = true;
    void overview.reload();
  };

  const data = overview.data;
  const cardClient = client.person && client.addNote && client.deleteNote && client.setTags
    ? { person: client.person, addNote: client.addNote, deleteNote: client.deleteNote, setTags: client.setTags }
    : undefined;
  return (
    <div className="admin-overview" aria-busy={overview.loading || overview.refreshing}>
      <header className="admin-overview-head">
        <div>
          <h2>Что происходит</h2>
          <p>{data ? `Данные на ${relativeTime(data.generatedAt)}` : 'Собираем данные…'}</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={overview.loading || overview.refreshing} onClick={refresh}>
          <RefreshCw size={16} aria-hidden="true" /> Обновить
        </button>
      </header>
      {overview.error && <p className="admin-overview-error" role="alert">{overview.error.message || 'Не удалось загрузить обзор'}</p>}
      {data && (
        <>
          <OverviewAlerts alerts={data.alerts} onNavigate={onNavigate} onOpenSegment={onOpenSegment} />
          <OverviewKpis overview={data} onOpenSegment={onOpenSegment} />
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
