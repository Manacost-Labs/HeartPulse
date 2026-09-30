import { useEffect, useMemo, useState } from 'react';
import { ADMIN_INPUT } from './contestAdminUi';

const PAGE_SIZE = 20;

export type TelegramAdminAccount = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: string;
  blockedAt: string;
  telegramId: string;
  telegramOidcId: string;
  telegramUsername: string;
  contactTelegram: string;
  photoUrl: string;
  hasTelegramIdentity: boolean;
  hasContactOnly: boolean;
  canBeChecked: boolean;
  hasAccess: boolean;
  telegramHasAccess: boolean;
  accessState: 'access' | 'checkable' | 'contact-only' | 'no-access' | 'blocked';
  source: string;
  message: string;
  checkedAt: string;
  updatedAt: string;
  stale: boolean;
  entitlements?: Partial<Record<string, boolean>>;
  chats: Array<Record<string, any>>;
  boostyHasAccess: boolean;
  createdAt: string;
  userUpdatedAt: string;
};

export type TelegramAccountsPayload = {
  configured: boolean;
  chatIds: string[];
  summary: { total: number; access: number; checkable: number; contactOnly: number; stale: number; blocked: number };
  accounts: TelegramAdminAccount[];
  fetchedAt: string;
  error?: string;
};

type AccessFilter = 'all' | 'access' | 'checkable' | 'contact-only' | 'stale' | 'blocked';

type ContestAdminTelegramProps = {
  payload: TelegramAccountsPayload | null;
  loading: boolean;
  onReload: () => void;
  formatDate: (value: string | null) => string;
  entitlementLabels: (account: Pick<TelegramAdminAccount, 'hasAccess' | 'entitlements'>) => string[];
};

const accessStateLabel: Record<TelegramAdminAccount['accessState'], string> = {
  access: 'Есть доступ',
  checkable: 'Можно проверить ботом',
  'contact-only': 'Только username',
  blocked: 'Заблокирован',
  'no-access': 'Нет доступа',
};

const CHAT_STATUS_LABEL: Record<string, string> = {
  creator: 'владелец группы', administrator: 'администратор группы', member: 'состоит', restricted: 'состоит с ограничениями',
  left: 'вышел из группы', kicked: 'исключён из группы',
};

/** Telegram's member status or error for one VIP group, in words an operator can act on. */
function chatStateLabel(chat: Record<string, unknown>): string {
  const error = String(chat.error || '');
  if (/chat not found|kicked|forbidden/i.test(error)) return 'бот не видит эту группу';
  if (error) return `ошибка проверки: ${error}`;
  const status = String(chat.status || '');
  if (CHAT_STATUS_LABEL[status]) return CHAT_STATUS_LABEL[status];
  return chat.isMember || chat.hasAccess ? 'состоит' : 'не состоит';
}

export function ContestAdminTelegram({ payload, loading, onReload, formatDate, entitlementLabels }: ContestAdminTelegramProps) {
  const [search, setSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [page, setPage] = useState(1);
  const filteredAccounts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (payload?.accounts || []).filter(account => {
      if (accessFilter === 'access' && !account.telegramHasAccess) return false;
      if (accessFilter === 'checkable' && account.accessState !== 'checkable') return false;
      if (accessFilter === 'contact-only' && account.accessState !== 'contact-only') return false;
      if (accessFilter === 'stale' && !account.stale) return false;
      if (accessFilter === 'blocked' && account.accessState !== 'blocked') return false;
      if (!query) return true;
      return [account.id, account.profileId, account.name, account.email, account.telegramId, account.telegramOidcId, account.telegramUsername, account.contactTelegram, account.source, account.message]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [accessFilter, payload, search]);
  const pageCount = Math.max(1, Math.ceil(filteredAccounts.length / PAGE_SIZE));
  const visibleAccounts = useMemo(
    () => filteredAccounts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredAccounts, page],
  );

  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount]);

  return (
    <div className="contest-admin-card admin-full-card">
      <div className="contest-users-head">
        <div>
          <h2>Telegram-аккаунты</h2>
          <p className="contest-muted">
            Профили с Telegram и историей проверки. Показано {visibleAccounts.length} из {filteredAccounts.length}
            {filteredAccounts.length !== (payload?.accounts.length || 0) ? ` · всего ${payload?.accounts.length || 0}` : ''}.
          </p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={loading} onClick={onReload}>
          {loading ? 'Загрузка...' : 'Обновить данные'}
        </button>
      </div>

      <div className={`admin-telegram-status ${payload?.error ? 'is-error' : payload?.configured ? 'is-ok' : 'is-warning'}`} role={payload?.error ? 'alert' : 'status'}>
        <div>
          <strong>{payload?.error ? 'Не удалось получить данные Telegram' : payload?.configured ? 'Telegram-бот настроен' : 'Telegram-бот не настроен'}</strong>
          {payload?.error && <span>{payload.error}</span>}
          <span>VIP-группы, в которых бот проверяет участников: {payload?.chatIds?.length ? payload.chatIds.join(', ') : 'не заданы'}</span>
          <span>Загружено: {payload?.fetchedAt ? formatDate(payload.fetchedAt) : 'ещё не загружено'} · проверок старше суток: {payload?.summary.stale ?? 0}</span>
        </div>
      </div>

      <div className="admin-stat-grid admin-telegram-stats">
        <div><span>Всего</span><strong>{payload?.summary.total ?? 0}</strong><small>Telegram-связанные профили</small></div>
        <div><span>С доступом</span><strong>{payload?.summary.access ?? 0}</strong><small>состоят в VIP-группах</small></div>
        <div><span>Можно проверить</span><strong>{payload?.summary.checkable ?? 0}</strong><small>Telegram привязан к профилю</small></div>
        <div><span>Не привязан</span><strong>{payload?.summary.contactOnly ?? 0}</strong><small>указан только ник, проверить нельзя</small></div>
      </div>

      <div className="admin-telegram-filters admin-page-toolbar">
        <label>Поиск<input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="email, имя, @username или Telegram ID" style={ADMIN_INPUT} /></label>
        <label>Статус<select value={accessFilter} onChange={event => { setAccessFilter(event.target.value as AccessFilter); setPage(1); }} style={ADMIN_INPUT}>
          <option value="all">Все</option><option value="access">Есть Telegram-доступ</option><option value="checkable">Можно проверить</option>
          <option value="contact-only">Telegram не привязан</option><option value="stale">Устаревшая проверка</option><option value="blocked">Заблокированные</option>
        </select></label>
      </div>

      <div className="admin-telegram-list" aria-busy={loading}>
        {loading && !payload?.accounts.length ? <p className="contest-muted" role="status">Загружаем Telegram-аккаунты...</p> : visibleAccounts.length ? visibleAccounts.map(account => (
          <article key={account.id} className={`admin-telegram-row is-${account.accessState}`}>
            <div className="admin-telegram-person">
              {account.photoUrl ? <img src={account.photoUrl} alt="" /> : <span>{(account.name || account.telegramUsername || account.email || '?').slice(0, 1).toUpperCase()}</span>}
              <div><strong>{account.name || account.telegramUsername || 'Без имени'}</strong><small>{account.email || 'email не указан'}</small><code>{account.profileId}</code></div>
            </div>
            <div><strong>{account.telegramUsername ? `@${account.telegramUsername}` : 'Ник Telegram не указан'}</strong><span>{account.telegramId ? `Привязан, ID ${account.telegramId}` : 'Telegram не привязан к профилю'}</span>{account.telegramOidcId && <span>Входил через Telegram</span>}<span>Контакт в профиле: {account.contactTelegram ? `@${account.contactTelegram}` : 'не указан'}</span></div>
            <div>
              <strong>{accessStateLabel[account.accessState]}</strong>
              <span>Открыто: {entitlementLabels(account).join(', ') || 'ничего'}</span>
              <span>{account.checkedAt ? `Проверено ${formatDate(account.checkedAt)}` : 'Ещё не проверялся'}{account.stale ? ' · проверка устарела' : ''}</span>
              {account.message && <small>{account.message}</small>}
            </div>
            <div className="admin-telegram-chats">
              <strong>VIP-группы</strong>
              {account.chats.length ? account.chats.map((chat, index) => (
                <span key={`${account.id}-${String(chat.chatId || index)}`} className={chat.isMember || chat.hasAccess ? 'is-member' : 'is-missing'}>
                  {String(chat.chatId || chat.id || 'группа')} · {chatStateLabel(chat)}
                </span>
              )) : <span>Группы ещё не проверялись</span>}
            </div>
          </article>
        )) : <p className="contest-muted" role="status">{payload ? 'Telegram-аккаунты не найдены по текущим фильтрам.' : 'Нажмите “Обновить Telegram”, чтобы загрузить список аккаунтов.'}</p>}
      </div>
      {pageCount > 1 && <nav className="admin-pagination" aria-label="Страницы списка Telegram-аккаунтов">
        <button type="button" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Назад</button>
        <span>Страница {page} из {pageCount}</span>
        <button type="button" disabled={page === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>Далее</button>
      </nav>}
    </div>
  );
}
