import React, { Suspense, useCallback, useState } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import { ContestAdminUserRow, type AdminUserPatch, type AdminUserSearchResult } from './ContestAdminUserRow';
import { ADMIN_INPUT } from './contestAdminUi';
import './adminPeople.css';
import {
  AdminSegmentBar,
  loadAdminClientCard,
  type AdminCrmSegmentId,
  type AdminCrmSegments,
} from '../modules/adminCrm/public';

export type { AdminUserPatch, AdminUserSearchResult } from './ContestAdminUserRow';

const AdminClientCard = React.lazy(loadAdminClientCard);

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
  onRefresh: () => void;
  onQueryChange: (query: string) => void;
  onPageChange: (page: number) => void;
  onToggleMenu: (userId: string) => void;
  onUpdateUser: (user: AdminUserSearchResult, patch: AdminUserPatch) => void;
  segments: AdminCrmSegments | null;
  segment: AdminCrmSegmentId;
  tag: string;
  onSegmentChange: (next: { segment: AdminCrmSegmentId; tag: string }) => void;
  /** Notes or tags changed inside the client card. */
  onPersonChanged: () => void;
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
  onRefresh,
  onQueryChange,
  onPageChange,
  onToggleMenu,
  onUpdateUser,
  segments,
  segment,
  tag,
  onSegmentChange,
  onPersonChanged,
}: ContestAdminUsersProps) {
  const [accessTarget, setAccessTarget] = useState<AdminUserSearchResult | null>(null);
  const [accessPeriod, setAccessPeriod] = useState('30');
  const [customAccessEnd, setCustomAccessEnd] = useState('');

  const [personId, setPersonId] = useState('');
  const closePerson = useCallback(() => setPersonId(''), []);
  const prepareAccessDialog = (user: AdminUserSearchResult) => {
    setAccessTarget(user);
    setAccessPeriod(user.manualAccess?.expiresAt ? 'custom' : user.lifetimeAccess ? 'forever' : '30');
    setCustomAccessEnd(user.manualAccess?.expiresAt ? String(user.manualAccess.expiresAt).slice(0, 16) : '');
  };
  const openAccessDialog = (user: AdminUserSearchResult) => {
    prepareAccessDialog(user);
    onToggleMenu(user.id);
  };
  const personUser = personId ? users.find(user => user.id === personId) : undefined;
  const filtered = Boolean(query.trim()) || segment !== 'all' || Boolean(tag);

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
    <div className="admin-people">
      <div className="admin-people-toolbar">
        <label className="admin-people-search">
          <Search size={18} aria-hidden="true" />
          <span className="admin-crm-sr-only">Поиск по людям</span>
          <input
            type="search"
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Имя, почта, Telegram, VK или ID"
          />
        </label>
        <button type="button" className="contest-secondary-button" disabled={loading} onClick={onRefresh}>
          <RefreshCw size={16} aria-hidden="true" /> {loading ? 'Загрузка…' : 'Обновить'}
        </button>
      </div>
      <AdminSegmentBar data={segments} segment={segment} tag={tag} disabled={loading} onChange={onSegmentChange} />
      <p className="admin-people-summary" role="status">
        {loading && !users.length
          ? 'Загружаем список…'
          : `${filtered ? 'Найдено' : 'Всего'} ${total.toLocaleString('ru-RU')} · страница ${page} из ${pageCount}`}
      </p>
      {users.length ? (
        <div className="admin-people-table-wrap" aria-busy={loading}>
          <table className="admin-people-table is-users">
            <thead>
              <tr>
                <th scope="col">Человек</th>
                <th scope="col">Доступ</th>
                <th scope="col">Контакты</th>
                <th scope="col">Активность</th>
                <th scope="col">Теги</th>
                <th scope="col"><span className="admin-crm-sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <ContestAdminUserRow key={user.id} currentUserId={currentUserId} user={user} actionId={actionId} openMenuId={openMenuId} menuRef={menuRef} menuTriggerMap={menuTriggerMap} onToggleMenu={onToggleMenu} onOpenAccessDialog={openAccessDialog} onUpdateUser={onUpdateUser} onOpenPerson={user => setPersonId(user.id)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && (
        <p className="admin-people-empty">
          {filtered ? 'По этому фильтру никого нет. Сбросьте сегмент или измените запрос.' : 'В базе пока нет пользователей.'}
        </p>
      )}
      {pageCount > 1 && (
        <nav className="admin-pagination" aria-label="Страницы списка пользователей">
          <button type="button" disabled={page === 1 || loading} onClick={() => onPageChange(Math.max(1, page - 1))}>Назад</button>
          <span>Страница {page} из {pageCount}</span>
          <button type="button" disabled={page === pageCount || loading} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>Далее</button>
        </nav>
      )}
      {personId && (
        <Suspense fallback={null}>
          <AdminClientCard
            userId={personId}
            onClose={closePerson}
            onChanged={onPersonChanged}
            onManageAccess={personUser ? () => { setPersonId(''); prepareAccessDialog(personUser); } : undefined}
          />
        </Suspense>
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
              <select autoFocus value={accessPeriod} onChange={event => setAccessPeriod(event.target.value)} style={ADMIN_INPUT}>
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
