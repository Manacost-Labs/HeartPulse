import { useEffect, useMemo, useState } from 'react';
import { ADMIN_INPUT } from './contestAdminUi';

const PAGE_SIZE = 20;

export type BoostyAdminStatus = {
  configured: boolean;
  ok: boolean;
  importStatus: string;
  source: string;
  stale: boolean;
  snapshotAgeSeconds: number | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  warnings: string[];
  summary: {
    active?: number;
    activePaid?: number;
    boostyPaid?: number;
    total?: number;
    [key: string]: unknown;
  };
  checkedAt?: string;
  graceHours?: number;
};

export type BoostySubscriberRow = {
  id: string;
  name: string;
  email: string;
  hasEmail: boolean;
  avatarUrl: string;
  status: string;
  subscribed: boolean;
  active: boolean;
  paid: boolean;
  hasActivePaidAccess: boolean;
  willRenew: boolean;
  blacklisted: boolean;
  canWrite: boolean;
  audienceType: string;
  contactStatus: string;
  level: { id: number | string | null; name: string; price: number; currency: string };
  money: { currentPrice: number; totalPayments: number; currency: string };
  dates: { subscribedAt: string | null; unsubscribedAt: string | null; nextPaymentAt: string | null };
  entitlements?: Partial<Record<string, boolean>>;
  siteAccess: boolean;
};

export type BoostySubscribersPayload = {
  configured: boolean;
  source: string;
  stale: boolean;
  summary: BoostyAdminStatus['summary'];
  levels: Record<string, number>;
  subscribers: BoostySubscriberRow[];
  fetchedAt: string;
  error?: string;
};

type AccessFilter = 'all' | 'site' | 'paid' | 'free' | 'inactive';

type ContestAdminBoostyProps = {
  status: BoostyAdminStatus | null;
  statusLoading: boolean;
  subscribers: BoostySubscribersPayload | null;
  subscribersLoading: boolean;
  onReload: () => void;
  formatDate: (value: string | null) => string;
  entitlementLabels: (subscriber: Pick<BoostySubscriberRow, 'siteAccess' | 'entitlements'>) => string[];
};

export function ContestAdminBoosty({
  status,
  statusLoading,
  subscribers,
  subscribersLoading,
  onReload,
  formatDate,
  entitlementLabels,
}: ContestAdminBoostyProps) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [page, setPage] = useState(1);
  const levelOptions = useMemo(
    () => Object.keys(subscribers?.levels || {}).sort((a, b) => a.localeCompare(b, 'ru')),
    [subscribers],
  );
  const filteredSubscribers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (subscribers?.subscribers || []).filter(subscriber => {
      if (levelFilter !== 'all' && (subscriber.level?.name || 'Без уровня') !== levelFilter) return false;
      if (accessFilter === 'site' && !subscriber.siteAccess) return false;
      if (accessFilter === 'paid' && !subscriber.hasActivePaidAccess) return false;
      if (accessFilter === 'free' && subscriber.hasActivePaidAccess) return false;
      if (accessFilter === 'inactive' && subscriber.active) return false;
      if (!query) return true;
      return [subscriber.id, subscriber.name, subscriber.email, subscriber.level?.name, subscriber.status, subscriber.audienceType]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [accessFilter, levelFilter, search, subscribers]);
  const pageCount = Math.max(1, Math.ceil(filteredSubscribers.length / PAGE_SIZE));
  const visibleSubscribers = useMemo(
    () => filteredSubscribers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredSubscribers, page],
  );
  const stats = useMemo(() => {
    const rows = subscribers?.subscribers || [];
    const summaryBoostyPaid = Number(subscribers?.summary?.boostyPaid);
    return {
      total: rows.length,
      siteAccess: rows.filter(row => row.siteAccess).length,
      activePaid: rows.filter(row => row.hasActivePaidAccess).length,
      boostyPaid: Number.isFinite(summaryBoostyPaid) ? summaryBoostyPaid : rows.filter(row => row.audienceType === 'boosty-paid').length,
      missingEmail: rows.filter(row => !row.hasEmail).length,
    };
  }, [subscribers]);
  const apiTone = statusLoading ? 'loading' : status?.ok ? 'ok' : status?.configured === false ? 'not-configured' : 'bad';
  const apiLabel = statusLoading ? 'проверяем' : apiTone === 'ok' ? 'работает' : apiTone === 'not-configured' ? 'не настроен' : 'ошибка';

  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);

  const updateSearch = (value: string) => { setSearch(value); setPage(1); };
  const updateLevel = (value: string) => { setLevelFilter(value); setPage(1); };
  const updateAccess = (value: AccessFilter) => { setAccessFilter(value); setPage(1); };

  return (
    <div className="contest-admin-card admin-full-card">
      <div className="contest-users-head">
        <div>
          <h2>Подписчики Boosty</h2>
          <p className="contest-muted">
            Распознанные уровни и доступы сайта. Показано {visibleSubscribers.length} из {filteredSubscribers.length}
            {filteredSubscribers.length !== (subscribers?.subscribers.length || 0) ? ` · всего ${subscribers?.subscribers.length || 0}` : ''}.
          </p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={statusLoading || subscribersLoading} onClick={onReload}>
          {statusLoading || subscribersLoading ? 'Загрузка...' : 'Обновить Boosty'}
        </button>
      </div>

      <div className={`admin-boosty-status admin-boosty-status-${apiTone}`} role={status?.lastErrorMessage ? 'alert' : 'status'}>
        <div>
          <strong>Boosty API: {apiLabel}</strong>
          <span>Источник: {status?.source || '—'} · Импорт: {status?.importStatus || '—'} · Grace: {status?.graceHours ?? 24} ч</span>
          <span>
            Возраст снапшота: {typeof status?.snapshotAgeSeconds === 'number' ? `${Math.round(status.snapshotAgeSeconds / 60)} мин` : '—'}
            {status?.checkedAt ? ` · Проверено: ${formatDate(status.checkedAt)}` : ''} · Без email: {stats.missingEmail}
          </span>
          {status?.lastErrorMessage && <span>Ошибка: {status.lastErrorMessage}</span>}
        </div>
      </div>

      <div className="admin-stat-grid admin-boosty-stats">
        <div><span>Всего Boosty</span><strong>{stats.total}</strong><small>включая неактивных</small></div>
        <div><span>Платные Boosty</span><strong>{stats.boostyPaid}</strong><small>как в кабинете Boosty</small></div>
        <div><span>Активный доступ</span><strong>{stats.activePaid}</strong><small>оплачено, даже без автопродления</small></div>
        <div><span>Доступ на сайте</span><strong>{stats.siteAccess}</strong><small>активная оплата + тариф распознан</small></div>
      </div>

      <div className="admin-boosty-levels" aria-label="Уровни Boosty">
        {levelOptions.map(levelName => (
          <button key={levelName} type="button" className={levelFilter === levelName ? 'is-active' : ''} onClick={() => updateLevel(levelFilter === levelName ? 'all' : levelName)}>
            <span>{levelName || 'Без уровня'}</span><b>{subscribers?.levels?.[levelName] ?? 0}</b>
          </button>
        ))}
        {!levelOptions.length && <p className="contest-muted">Уровни появятся после загрузки Boosty.</p>}
      </div>

      <div className="admin-boosty-filters admin-page-toolbar">
        <label>Поиск<input value={search} onChange={event => updateSearch(event.target.value)} placeholder="email, имя, Boosty ID или уровень" style={ADMIN_INPUT} /></label>
        <label>Уровень<select value={levelFilter} onChange={event => updateLevel(event.target.value)} style={ADMIN_INPUT}>
          <option value="all">Все уровни</option>
          {levelOptions.map(levelName => <option key={levelName} value={levelName}>{levelName || 'Без уровня'}</option>)}
        </select></label>
        <label>Статус<select value={accessFilter} onChange={event => updateAccess(event.target.value as AccessFilter)} style={ADMIN_INPUT}>
          <option value="all">Все</option><option value="site">Доступ на сайте</option><option value="paid">Активные платные</option>
          <option value="free">Без платной подписки</option><option value="inactive">Неактивные</option>
        </select></label>
      </div>

      <p className="contest-muted">Источник списка: {subscribers?.source || '—'} · Загружено: {subscribers?.fetchedAt ? formatDate(subscribers.fetchedAt) : '—'}</p>
      {subscribers?.error && <div className="contest-message contest-message-err" role="alert">{subscribers.error}</div>}

      <div className="admin-boosty-list" aria-busy={subscribersLoading}>
        {subscribersLoading && !subscribers?.subscribers.length ? <p className="contest-muted" role="status">Загружаем Boosty-аудиторию...</p> : visibleSubscribers.length ? visibleSubscribers.map(subscriber => {
          const accessLabels = entitlementLabels(subscriber);
          return (
            <article key={subscriber.id} className={`admin-boosty-row ${subscriber.siteAccess ? 'has-site-access' : subscriber.hasActivePaidAccess ? 'has-paid-access' : ''}`}>
              <div className="admin-boosty-person">
                {subscriber.avatarUrl ? <img src={subscriber.avatarUrl} alt="" /> : <span>{(subscriber.name || subscriber.email || '?').slice(0, 1).toUpperCase()}</span>}
                <div><strong>{subscriber.name || 'Без имени'}</strong><small className={subscriber.hasEmail ? '' : 'is-warning'}>{subscriber.email || 'email не открыт'}</small><code>Boosty ID {subscriber.id}</code></div>
              </div>
              <div><strong>{subscriber.level?.name || 'Без уровня'}</strong><span>Цена: {subscriber.money?.currentPrice || subscriber.level?.price || 0} {subscriber.money?.currency || subscriber.level?.currency || 'RUB'}</span><span>Статус: {subscriber.active ? 'active' : subscriber.status || 'inactive'}</span><span>Продление: {subscriber.willRenew ? 'да' : 'нет'}</span></div>
              <div><strong>{subscriber.siteAccess ? 'Открывает сайт' : subscriber.hasActivePaidAccess ? 'Платит, но тариф не сопоставлен' : 'Не открывает сайт'}</strong><span>Доступы: {accessLabels.join(', ') || 'нет'}</span><span>Следующий платеж: {subscriber.dates?.nextPaymentAt ? formatDate(subscriber.dates.nextPaymentAt) : '—'}</span><span>Подписан: {subscriber.dates?.subscribedAt ? formatDate(subscriber.dates.subscribedAt) : '—'}</span></div>
            </article>
          );
        }) : <p className="contest-muted" role="status">{subscribers ? 'Подписчики Boosty не найдены по текущим фильтрам.' : 'Нажмите “Обновить Boosty”, чтобы загрузить список подписчиков.'}</p>}
      </div>
      {pageCount > 1 && <nav className="admin-pagination" aria-label="Страницы списка подписчиков Boosty">
        <button type="button" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Назад</button>
        <span>Страница {page} из {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>Далее</button>
      </nav>}
    </div>
  );
}
