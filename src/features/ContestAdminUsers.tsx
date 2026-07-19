import React, { useState } from 'react';
import { CalendarClock, MoreVertical, ShieldCheck, Trash2, Users, X } from 'lucide-react';
import { ADMIN_INPUT } from './contestAdminUi';

export type AdminUserSearchResult = {
  id: string;
  profileId: string;
  name: string;
  email: string;
  role: string;
  country: string;
  telegramId?: string;
  telegramUsername: string;
  telegramOidcId?: string;
  contactVkUrl: string;
  contactTelegram: string;
  contactEmail: string;
  newsletterOptIn?: boolean;
  lifetimeAccess?: boolean;
  lifetimeGrantedAt?: string;
  manualAccess?: {
    enabled: boolean;
    expiresAt: string | null;
  };
  subscription: {
    hasAccess: boolean;
    source: string;
    checkedAt: string;
    message?: string;
    entitlements?: Partial<Record<string, boolean>>;
  };
  contestEntriesCount?: number;
  blockedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminUserPatch = {
  role?: 'admin' | 'user';
  blocked?: boolean;
  lifetimeAccess?: boolean;
  manualAccess?: {
    enabled: boolean;
    expiresAt: string | null;
  };
};

type ContestAdminUsersProps = {
  currentUserId?: string;
  users: AdminUserSearchResult[];
  total: number;
  loading: boolean;
  query: string;
  page: number;
  pageCount: number;
  actionId: string;
  openMenuId: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuTriggerMap: Map<string, HTMLButtonElement>;
  formatDate: (value: string) => string;
  onRefresh: () => void;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onToggleMenu: (userId: string) => void;
  onUpdateUser: (user: AdminUserSearchResult, patch: AdminUserPatch) => void;
};

export function ContestAdminUsers({
  currentUserId,
  users,
  total,
  loading,
  query,
  page,
  pageCount,
  actionId,
  openMenuId,
  menuRef,
  menuTriggerMap,
  formatDate,
  onRefresh,
  onQueryChange,
  onPageChange,
  onToggleMenu,
  onUpdateUser,
}: ContestAdminUsersProps) {
  const [accessTarget, setAccessTarget] = useState<AdminUserSearchResult | null>(null);
  const [accessPeriod, setAccessPeriod] = useState('30');
  const [customAccessEnd, setCustomAccessEnd] = useState('');

  const openAccessDialog = (user: AdminUserSearchResult) => {
    setAccessTarget(user);
    setAccessPeriod(user.manualAccess?.expiresAt ? 'custom' : user.lifetimeAccess ? 'forever' : '30');
    setCustomAccessEnd(user.manualAccess?.expiresAt ? String(user.manualAccess.expiresAt).slice(0, 16) : '');
    onToggleMenu(user.id);
  };

  const submitAccess = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessTarget) return;
    let expiresAt: string | null = null;
    if (accessPeriod === 'custom') {
      const parsed = new Date(customAccessEnd);
      if (!customAccessEnd || !Number.isFinite(parsed.getTime()) || parsed.getTime() <= Date.now()) return;
      expiresAt = parsed.toISOString();
    } else if (accessPeriod !== 'forever') {
      expiresAt = new Date(Date.now() + Number(accessPeriod) * 24 * 60 * 60 * 1000).toISOString();
    }
    const user = accessTarget;
    setAccessTarget(null);
    onUpdateUser(user, { manualAccess: { enabled: true, expiresAt } });
  };

  return (
    <div className="contest-admin-card contest-admin-search admin-full-card">
      <div className="contest-users-head">
        <div>
          <h2>Пользователи</h2>
          <p className="contest-muted">Единая база профилей Манакоста. Показано {users.length} из {total}.</p>
        </div>
        <button type="button" className="contest-secondary-button" disabled={loading} onClick={onRefresh}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>
      <div className="admin-page-toolbar admin-user-toolbar">
        <label>
          Фильтр по ID, почте, имени, Telegram или VK
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="user_..., email, имя или username"
            style={ADMIN_INPUT}
          />
        </label>
      </div>
      <div className="contest-user-results">
        {loading && !users.length ? (
          <p className="contest-muted" role="status">Загружаем список пользователей...</p>
        ) : users.length ? users.map(user => (
          <div key={user.id} className="contest-user-row">
            <div>
              <strong>{user.name}</strong>
              <span>ID: {user.profileId}</span>
              <span>{user.email || 'email не указан'} · {user.country || 'страна не указана'} · {user.role === 'admin' ? 'администратор' : 'пользователь'}</span>
              <span>TG: {user.contactTelegram || user.telegramUsername || user.telegramId || '—'} · VK: {user.contactVkUrl || '—'} · связь: {user.contactEmail || '—'}</span>
              <span>Конкурсы: {user.contestEntriesCount ?? 0} · создан: {user.createdAt ? formatDate(user.createdAt) : '—'}</span>
            </div>
            <div className="contest-user-badges">
              <span className={user.blockedAt ? 'contest-role-blocked' : user.role === 'admin' ? 'contest-role-admin' : 'contest-role-user'}>
                {user.blockedAt ? 'заблокирован' : user.role === 'admin' ? 'админ' : 'участник'}
              </span>
              <span className={user.subscription?.hasAccess ? 'contest-access-ok' : 'contest-access-no'}>
                {user.lifetimeAccess
                  ? 'полный доступ · навсегда'
                  : user.manualAccess?.enabled && user.manualAccess.expiresAt
                    ? `полный доступ · до ${formatDate(user.manualAccess.expiresAt)}`
                    : user.subscription?.hasAccess ? 'подписка' : 'нет доступа'}
              </span>
              <div className="contest-user-action-menu-wrap">
                <button
                  ref={node => {
                    if (node) menuTriggerMap.set(user.id, node);
                    else menuTriggerMap.delete(user.id);
                  }}
                  type="button"
                  className="contest-user-menu-trigger"
                  disabled={Boolean(actionId)}
                  aria-label={`Действия с пользователем ${user.name || user.email || user.id}`}
                  aria-haspopup="menu"
                  aria-expanded={openMenuId === user.id}
                  aria-controls={openMenuId === user.id ? `user-actions-${user.id}` : undefined}
                  onClick={() => onToggleMenu(user.id)}
                >
                  {actionId.startsWith(`${user.id}:`) ? <span className="admin-action-spinner" aria-hidden="true" /> : <MoreVertical size={20} />}
                </button>
                {openMenuId === user.id && (
                  <div ref={menuRef} id={`user-actions-${user.id}`} className="contest-user-menu" role="menu" aria-label={`Действия: ${user.name || user.email}`}>
                    <button type="button" role="menuitem" onClick={() => openAccessDialog(user)}>
                      <CalendarClock size={16} />
                      <span>{user.manualAccess?.enabled ? 'Изменить полный доступ' : 'Дать полный доступ'}<small>На период или навсегда</small></span>
                    </button>
                    {user.manualAccess?.enabled && (
                      <button type="button" role="menuitem" onClick={() => onUpdateUser(user, { manualAccess: { enabled: false, expiresAt: null } })}>
                        <ShieldCheck size={16} />
                        <span>Отозвать полный доступ<small>Обычная подписка пользователя сохранится</small></span>
                      </button>
                    )}
                    <button type="button" role="menuitem" disabled={currentUserId === user.id} onClick={() => onUpdateUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })}>
                      <Users size={16} />
                      <span>{user.role === 'admin' ? 'Снять права администратора' : 'Сделать администратором'}<small>Изменить уровень управления</small></span>
                    </button>
                    <hr className="contest-user-menu-divider" />
                    <button type="button" role="menuitem" className={!user.blockedAt ? 'is-danger' : undefined} disabled={currentUserId === user.id} onClick={() => onUpdateUser(user, { blocked: !user.blockedAt })}>
                      <Trash2 size={16} />
                      <span>{user.blockedAt ? 'Разблокировать' : 'Заблокировать'}<small>{user.blockedAt ? 'Вернуть доступ к аккаунту' : 'Закрыть вход и исключить из рассылки'}</small></span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )) : (
          <p className="contest-muted" role="status">
            {query.trim() ? 'По этому фильтру пользователей нет.' : 'В единой базе пока нет пользователей.'}
          </p>
        )}
      </div>
      {pageCount > 1 && (
        <nav className="admin-pagination" aria-label="Страницы списка пользователей">
          <button type="button" disabled={page === 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))}>Назад</button>
          <span>Страница {page} из {pageCount}</span>
          <button type="button" disabled={page === pageCount || loading} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>Далее</button>
        </nav>
      )}
      {accessTarget && (
        <div className="admin-access-dialog-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) setAccessTarget(null);
        }}>
          <form className="admin-access-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-access-dialog-title" onSubmit={submitAccess}>
            <div className="admin-access-dialog-head">
              <div>
                <span>Полный доступ</span>
                <h3 id="admin-access-dialog-title">{accessTarget.name || accessTarget.email || accessTarget.id}</h3>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setAccessTarget(null)}><X size={20} /></button>
            </div>
            <p>Открывает все функции и закрытые разделы сайта независимо от тарифа пользователя.</p>
            <label>
              Срок доступа
              <select value={accessPeriod} onChange={event => setAccessPeriod(event.target.value)} style={ADMIN_INPUT}>
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
                <option value="365">1 год</option>
                <option value="custom">До выбранной даты</option>
                <option value="forever">Навсегда</option>
              </select>
            </label>
            {accessPeriod === 'custom' && (
              <label>
                Доступ до
                <input
                  type="datetime-local"
                  required
                  value={customAccessEnd}
                  min={new Date(Date.now() + 60_000).toISOString().slice(0, 16)}
                  onChange={event => setCustomAccessEnd(event.target.value)}
                  style={ADMIN_INPUT}
                />
              </label>
            )}
            <div className="admin-access-dialog-actions">
              <button type="button" className="contest-secondary-button" onClick={() => setAccessTarget(null)}>Отмена</button>
              <button type="submit" className="contest-primary-button">Выдать доступ</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
