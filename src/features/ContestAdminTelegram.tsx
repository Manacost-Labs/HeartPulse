import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { AdminFilterChips, loadAdminClientCard } from '../modules/adminCrm/public';
import {
  chatStateLabel,
  filterTelegramAccounts,
  telegramAccess,
  telegramFilterOptions,
  unreadableTelegramChats,
  type TelegramAccessFilter,
  type TelegramAccountsPayload,
  type TelegramAdminAccount,
} from './adminIntegrationListModel';
import { AdminListPager } from './AdminListPager';
import { adminListSummary } from './adminListText';
import './adminPeople.css';

export type { TelegramAccountsPayload, TelegramAdminAccount } from './adminIntegrationListModel';

const AdminClientCard = React.lazy(loadAdminClientCard);
const PAGE_SIZE = 20;

type ContestAdminTelegramProps = {
  payload: TelegramAccountsPayload | null;
  loading: boolean;
  onReload: () => void;
  formatDate: (value: string | null) => string;
  entitlementLabels: (account: Pick<TelegramAdminAccount, 'hasAccess' | 'entitlements'>) => string[];
};

type RowProps = Pick<ContestAdminTelegramProps, 'formatDate' | 'entitlementLabels'> & {
  account: TelegramAdminAccount;
  onOpenPerson: (userId: string) => void;
};

function TelegramChats({ account }: { account: TelegramAdminAccount }) {
  if (!account.chats.length) return <small>группы ещё не проверялись</small>;
  return (
    <div className="admin-people-chats">
      {account.chats.map((chat, index) => {
        const state = chatStateLabel(chat);
        const tone = state.member ? 'is-member' : state.label.startsWith('бот не видит') || state.label.startsWith('ошибка') ? 'is-broken' : 'is-missing';
        return (
          <span key={`${account.id}-${String(chat.chatId || index)}`} className={tone}>
            {state.label} <code>{String(chat.chatId || chat.id || 'группа')}</code>
          </span>
        );
      })}
    </div>
  );
}

function TelegramRow({ account, formatDate, entitlementLabels, onOpenPerson }: RowProps) {
  const access = telegramAccess(account);
  const opened = entitlementLabels(account);
  const name = account.name || account.telegramUsername || 'Без имени';
  return (
    <tr className="admin-people-row admin-telegram-row">
      <td className="admin-people-cell-person">
        <div className="admin-people-person">
          {account.photoUrl
            ? <img className="admin-people-avatar" src={account.photoUrl} alt="" />
            : <span className="admin-people-avatar" aria-hidden="true">{(account.name || account.telegramUsername || account.email || '?').slice(0, 1).toUpperCase()}</span>}
          <div>
            <button type="button" className="admin-crm-open" aria-haspopup="dialog" onClick={() => onOpenPerson(account.id)}>{name}</button>
            <small>{account.email || 'email не указан'}</small>
            <small>ID {account.profileId}</small>
          </div>
        </div>
      </td>
      <td data-label="Telegram">
        <span>{account.telegramUsername ? `@${account.telegramUsername}` : 'ник не указан'}</span>
        <small>{account.telegramId ? `привязан, ID ${account.telegramId}` : 'не привязан к профилю'}</small>
        {account.telegramOidcId && <small>входил через Telegram</small>}
      </td>
      <td data-label="Доступ">
        <span className={`admin-crm-pill is-${access.tone}`}>{access.label}</span>
        <small>{opened.length ? `открыто: ${opened.join(', ')}` : 'разделы не открыты'}</small>
        <small>{account.checkedAt ? `проверено ${formatDate(account.checkedAt)}${account.stale ? ' · проверка устарела' : ''}` : 'ещё не проверялся'}</small>
      </td>
      <td data-label="VIP-группы"><TelegramChats account={account} /></td>
    </tr>
  );
}

function TelegramStatus({ payload, unreadable }: { payload: TelegramAccountsPayload | null; unreadable: string[] }) {
  const tone = payload?.error ? 'is-bad' : payload?.configured && !unreadable.length ? '' : 'is-warn';
  const title = payload?.error ? 'Не удалось получить данные Telegram' : payload?.configured ? 'Telegram-бот настроен' : 'Telegram-бот не настроен';
  return (
    <div className={`admin-people-status admin-telegram-status ${tone}`} role={payload?.error ? 'alert' : 'status'}>
      <strong>{title}</strong>
      {payload?.error && <span>{payload.error}</span>}
      <span>VIP-группы, в которых бот проверяет участников: {payload?.chatIds?.length ? payload.chatIds.join(', ') : 'не заданы'}</span>
      {unreadable.length > 0 && <span className="admin-people-status-warning">Бот не видит {unreadable.length === 1 ? 'группу' : 'группы'} {unreadable.join(', ')}: верните бота в группу или обновите её ID. Участники только этой группы не получают доступ.</span>}
      <span>Бот может проверить {payload?.summary.checkable ?? 0} из {payload?.summary.total ?? 0} профилей: у остальных Telegram не привязан.</span>
    </div>
  );
}

export function ContestAdminTelegram({ payload, loading, onReload, formatDate, entitlementLabels }: ContestAdminTelegramProps) {
  const [search, setSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<TelegramAccessFilter>('all');
  const [page, setPage] = useState(1);
  const [personId, setPersonId] = useState('');
  const closePerson = useCallback(() => setPersonId(''), []);
  const accounts = useMemo(() => payload?.accounts ?? [], [payload]);
  const filtered = useMemo(() => filterTelegramAccounts(accounts, { search, access: accessFilter }), [accessFilter, accounts, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  const unreadable = useMemo(() => unreadableTelegramChats(accounts), [accounts]);
  const summary = loading && !accounts.length
    ? 'Загружаем Telegram-аккаунты…'
    : payload
      ? adminListSummary(filtered.length, accounts.length, page, pageCount, payload.fetchedAt ? formatDate(payload.fetchedAt) : '')
      : 'Нажмите «Обновить», чтобы загрузить Telegram-аккаунты.';

  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);

  return (
    <div className="admin-people admin-telegram">
      <TelegramStatus payload={payload} unreadable={unreadable} />
      <div className="admin-people-toolbar">
        <label className="admin-people-search">
          <Search size={18} aria-hidden="true" />
          <span className="admin-crm-sr-only">Поиск по Telegram-аккаунтам</span>
          <input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="Имя, почта, @ник или Telegram ID" />
        </label>
        <button type="button" className="contest-secondary-button admin-people-reload" disabled={loading} onClick={onReload}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>
      <div className="admin-crm-segments">
        <AdminFilterChips label="Статус Telegram" options={telegramFilterOptions(accounts)} value={accessFilter} onChange={id => { setAccessFilter(id); setPage(1); }} />
      </div>
      <p className="admin-people-summary" role="status">{summary}</p>
      {visible.length ? (
        <div className="admin-people-table-wrap" aria-busy={loading}>
          <table className="admin-people-table is-telegram">
            <thead>
              <tr><th scope="col">Человек</th><th scope="col">Telegram</th><th scope="col">Доступ</th><th scope="col">VIP-группы</th></tr>
            </thead>
            <tbody>
              {visible.map(account => <TelegramRow key={account.id} account={account} formatDate={formatDate} entitlementLabels={entitlementLabels} onOpenPerson={setPersonId} />)}
            </tbody>
          </table>
        </div>
      ) : payload && !payload.error && !loading && (
        <p className="admin-people-empty">Telegram-аккаунты не найдены по текущим фильтрам.</p>
      )}
      <AdminListPager label="Страницы списка Telegram-аккаунтов" page={page} pageCount={pageCount} onPage={setPage} />
      {personId && (
        <Suspense fallback={null}>
          <AdminClientCard userId={personId} onClose={closePerson} />
        </Suspense>
      )}
    </div>
  );
}
