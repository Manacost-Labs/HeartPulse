import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AdminOperationsHeader } from './AdminOperationsHeader';
import { ContestAdminUserRow, type AdminUserPatch, type AdminUserSearchResult } from './ContestAdminUserRow';
import { ADMIN_INPUT } from './contestAdminUi';

export type { AdminUserPatch, AdminUserSearchResult } from './ContestAdminUserRow';

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
  const visibleAccessCount = users.filter(user => user.subscription?.hasAccess || user.lifetimeAccess || user.manualAccess?.enabled).length;
  const visibleBlockedCount = users.filter(user => Boolean(user.blockedAt)).length;

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
    <div className="admin-operations-page admin-users-page">
      <AdminOperationsHeader
        eyebrow="Аудитория"
        title="Пользователи"
        description="Поиск профилей, управление доступом и блокировками в одном списке."
        status={loading ? 'Обновляем данные' : visibleBlockedCount ? `${visibleBlockedCount} требуют внимания` : 'База готова к работе'}
        statusTone={loading ? 'working' : visibleBlockedCount ? 'attention' : 'ready'}
        metrics={[
          query.trim()
            ? { label: 'Найдено', value: total, detail: 'по текущему фильтру' }
            : { label: 'Всего профилей', value: total, detail: 'в единой базе' },
          { label: 'На странице', value: users.length, detail: query.trim() ? 'по текущему фильтру' : `страница ${page} из ${pageCount}` },
          { label: 'С доступом', value: visibleAccessCount, detail: 'на этой странице' },
          { label: 'Заблокированы', value: visibleBlockedCount, detail: 'на этой странице' },
        ]}
        actions={(
          <button type="button" className="contest-secondary-button" disabled={loading} onClick={onRefresh}>
            {loading ? 'Загрузка…' : 'Обновить'}
          </button>
        )}
      />
      <section className="contest-admin-card contest-admin-search admin-full-card" aria-labelledby="admin-users-search-title">
        <div className="admin-card-heading admin-users-search-heading">
          <div>
            <h2 id="admin-users-search-title">Найти пользователя</h2>
            <p className="contest-muted">Ищите по любому известному контакту или внутреннему ID.</p>
          </div>
        </div>
        <div className="admin-page-toolbar admin-user-toolbar">
          <label>
            ID, почта, имя, Telegram или VK
            <input
              type="search"
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
          <ContestAdminUserRow key={user.id} currentUserId={currentUserId} user={user} actionId={actionId} openMenuId={openMenuId} menuRef={menuRef} menuTriggerMap={menuTriggerMap} formatDate={formatDate} onToggleMenu={onToggleMenu} onOpenAccessDialog={openAccessDialog} onUpdateUser={onUpdateUser} />
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
      </section>
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
