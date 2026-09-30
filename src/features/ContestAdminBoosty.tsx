import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { AdminFilterChips } from '../modules/adminCrm/public';
import {
  BOOSTY_NO_LEVEL,
  boostyFilterOptions,
  boostySiteAccess,
  boostySubscription,
  filterBoostySubscribers,
  type BoostyAccessFilter,
  type BoostyAdminStatus,
  type BoostySubscriberRow,
  type BoostySubscribersPayload,
} from './adminIntegrationListModel';
import { AdminListPager, adminListSummary } from './AdminListPager';
import './adminPeople.css';

export type { BoostyAdminStatus, BoostySubscriberRow, BoostySubscribersPayload } from './adminIntegrationListModel';

const PAGE_SIZE = 20;

type ContestAdminBoostyProps = {
  status: BoostyAdminStatus | null;
  statusLoading: boolean;
  subscribers: BoostySubscribersPayload | null;
  subscribersLoading: boolean;
  onReload: () => void;
  formatDate: (value: string | null) => string;
  entitlementLabels: (subscriber: Pick<BoostySubscriberRow, 'siteAccess' | 'entitlements'>) => string[];
};

/** When the subscriber list was last refreshed and how long access survives a Boosty outage. */
function boostyFreshnessText(status: BoostyAdminStatus | null): string {
  const age = typeof status?.snapshotAgeSeconds === 'number' ? `${Math.max(1, Math.round(status.snapshotAgeSeconds / 60))} мин назад` : 'неизвестно когда';
  return `Список подписчиков обновлён ${age}${status?.stale ? ' — данные устарели' : ''}. Если Boosty недоступен, доступ подписчиков сохраняется ещё ${status?.graceHours ?? 24} ч.`;
}

function boostyEmailText(missingEmail: number): string {
  return missingEmail
    ? `У ${missingEmail} подписчиков Boosty не показывает email: связать их с профилем можно только вручную.`
    : 'У всех подписчиков виден email.';
}

const priceText = (subscriber: BoostySubscriberRow) => {
  const price = subscriber.money?.currentPrice || subscriber.level?.price || 0;
  const currency = subscriber.money?.currency || subscriber.level?.currency || 'RUB';
  return price ? `${price.toLocaleString('ru-RU')} ${currency === 'RUB' ? '₽' : currency} в месяц` : 'бесплатно';
};

// Table cells show the day only; times stay in the status line where they matter.
const day = (value: string) => new Date(value).toLocaleDateString('ru-RU');

type RowProps = Pick<ContestAdminBoostyProps, 'entitlementLabels'> & { subscriber: BoostySubscriberRow };

function BoostyRow({ subscriber, entitlementLabels }: RowProps) {
  const subscription = boostySubscription(subscriber);
  const siteAccess = boostySiteAccess(subscriber);
  const opened = entitlementLabels(subscriber);
  return (
    <tr className="admin-people-row admin-boosty-row">
      <td className="admin-people-cell-person">
        <div className="admin-people-person">
          {subscriber.avatarUrl
            ? <img className="admin-people-avatar" src={subscriber.avatarUrl} alt="" />
            : <span className="admin-people-avatar" aria-hidden="true">{(subscriber.name || subscriber.email || '?').slice(0, 1).toUpperCase()}</span>}
          <div>
            <strong>{subscriber.name || 'Без имени'}</strong>
            <small>{subscriber.email || 'Boosty не показывает email'}</small>
            <small>Boosty ID {subscriber.id}</small>
          </div>
        </div>
      </td>
      <td data-label="Уровень">
        <span>{subscriber.level?.name || BOOSTY_NO_LEVEL}</span>
        <small>{priceText(subscriber)}</small>
      </td>
      <td data-label="Подписка">
        <span className={`admin-crm-pill is-${subscription.tone}`}>{subscription.label}</span>
        {subscription.detail && <small>{subscription.detail}</small>}
        {subscriber.hasActivePaidAccess && <small>{subscriber.dates?.nextPaymentAt ? `следующий платёж ${day(subscriber.dates.nextPaymentAt)}` : 'платёж не запланирован'}</small>}
      </td>
      <td data-label="Доступ на сайте">
        <span className={`admin-crm-pill is-${siteAccess.tone}`}>{siteAccess.label}</span>
        <small>{siteAccess.detail || (opened.length ? `открыто: ${opened.join(', ')}` : 'разделы не открыты')}</small>
      </td>
      <td data-label="Подписан">
        <span>{subscriber.dates?.subscribedAt ? day(subscriber.dates.subscribedAt) : '—'}</span>
      </td>
    </tr>
  );
}

type StatusProps = Pick<ContestAdminBoostyProps, 'status' | 'statusLoading' | 'formatDate'> & { missingEmail: number };

function BoostyStatus({ status, statusLoading, formatDate, missingEmail }: StatusProps) {
  const tone = statusLoading ? 'loading' : status?.ok ? 'ok' : status?.configured === false ? 'not-configured' : 'bad';
  const label = { loading: 'проверяем', ok: 'работает', 'not-configured': 'не настроен', bad: 'ошибка' }[tone];
  return (
    <div className={`admin-people-status admin-boosty-status ${tone === 'bad' ? 'is-bad' : tone === 'ok' ? '' : 'is-warn'}`} role={status?.lastErrorMessage ? 'alert' : 'status'}>
      <strong>Boosty API: {label}</strong>
      <span>{boostyFreshnessText(status)}</span>
      <span>{boostyEmailText(missingEmail)}{status?.checkedAt ? ` Проверено: ${formatDate(status.checkedAt)}.` : ''}</span>
      {status?.lastErrorMessage && <span>Ошибка: {status.lastErrorMessage}</span>}
    </div>
  );
}

export function ContestAdminBoosty({ status, statusLoading, subscribers, subscribersLoading, onReload, formatDate, entitlementLabels }: ContestAdminBoostyProps) {
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [accessFilter, setAccessFilter] = useState<BoostyAccessFilter>('all');
  const [page, setPage] = useState(1);
  const rows = useMemo(() => subscribers?.subscribers ?? [], [subscribers]);
  const levelOptions = useMemo(() => [
    { id: 'all', label: 'Все уровни' },
    ...Object.keys(subscribers?.levels || {}).sort((a, b) => a.localeCompare(b, 'ru'))
      .map(name => ({ id: name || BOOSTY_NO_LEVEL, label: name || BOOSTY_NO_LEVEL, count: subscribers?.levels?.[name] ?? 0 })),
  ], [subscribers]);
  const filtered = useMemo(() => filterBoostySubscribers(rows, { search, level: levelFilter, access: accessFilter }), [accessFilter, levelFilter, rows, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const loading = statusLoading || subscribersLoading;
  const summary = subscribersLoading && !rows.length
    ? 'Загружаем подписчиков Boosty…'
    : subscribers
      ? adminListSummary(filtered.length, rows.length, page, pageCount, subscribers.fetchedAt ? formatDate(subscribers.fetchedAt) : '')
      : 'Нажмите «Обновить», чтобы загрузить подписчиков Boosty.';

  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);

  return (
    <div className="admin-people admin-boosty">
      <BoostyStatus status={status} statusLoading={statusLoading} formatDate={formatDate} missingEmail={rows.filter(row => !row.hasEmail).length} />
      <div className="admin-people-toolbar">
        <label className="admin-people-search">
          <Search size={18} aria-hidden="true" />
          <span className="admin-crm-sr-only">Поиск по подписчикам Boosty</span>
          <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Имя, почта, Boosty ID или уровень" />
        </label>
        <button type="button" className="contest-secondary-button admin-people-reload" disabled={loading} onClick={onReload}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>
      <div className="admin-crm-segments">
        <AdminFilterChips label="Статус подписчика" options={boostyFilterOptions(rows)} value={accessFilter} onChange={id => { setAccessFilter(id); setPage(1); }} />
        {levelOptions.length > 1 && (
          <AdminFilterChips label="Уровень Boosty" options={levelOptions} value={levelFilter} onChange={id => { setLevelFilter(id); setPage(1); }} secondary />
        )}
      </div>
      {subscribers?.error && <div className="contest-message contest-message-err" role="alert">{subscribers.error}</div>}
      <p className="admin-people-summary" role="status">{summary}</p>
      {visible.length ? (
        <div className="admin-people-table-wrap" aria-busy={subscribersLoading}>
          <table className="admin-people-table is-boosty">
            <thead>
              <tr><th scope="col">Подписчик</th><th scope="col">Уровень</th><th scope="col">Подписка</th><th scope="col">Доступ на сайте</th><th scope="col">Подписан</th></tr>
            </thead>
            <tbody>
              {visible.map(subscriber => <BoostyRow key={subscriber.id} subscriber={subscriber} entitlementLabels={entitlementLabels} />)}
            </tbody>
          </table>
        </div>
      ) : subscribers && !subscribers.error && !subscribersLoading && (
        <p className="admin-people-empty">Подписчики Boosty не найдены по текущим фильтрам.</p>
      )}
      <AdminListPager label="Страницы списка подписчиков Boosty" page={page} pageCount={pageCount} onPage={setPage} />
    </div>
  );
}
