import type React from 'react';
import { CalendarClock, MoreVertical, ShieldCheck, Trash2, Users } from 'lucide-react';

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
  manualAccess?: { enabled: boolean; expiresAt: string | null };
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
  manualAccess?: { enabled: boolean; expiresAt: string | null };
};

type ContestAdminUserRowProps = {
  currentUserId?: string;
  user: AdminUserSearchResult;
  actionId: string;
  openMenuId: string;
  menuRef: React.RefObject<HTMLDivElement | null>;
  menuTriggerMap: Map<string, HTMLButtonElement>;
  formatDate: (value: string) => string;
  onToggleMenu: (userId: string) => void;
  onOpenAccessDialog: (user: AdminUserSearchResult) => void;
  onUpdateUser: (user: AdminUserSearchResult, patch: AdminUserPatch) => void;
};

export function ContestAdminUserRow({ currentUserId, user, actionId, openMenuId, menuRef, menuTriggerMap, formatDate, onToggleMenu, onOpenAccessDialog, onUpdateUser }: ContestAdminUserRowProps) {
  return (
    <div className="contest-user-row">
      <div className="admin-user-profile">
        <div className="admin-user-identity"><strong>{user.name || 'Без имени'}</strong><span>ID: {user.profileId} · {user.role === 'admin' ? 'администратор' : 'пользователь'}</span></div>
        <dl className="admin-user-facts">
          <div><dt>Почта и страна</dt><dd>{user.email || 'email не указан'} · {user.country || 'страна не указана'}</dd></div>
          <div><dt>Контакты</dt><dd>TG: {user.contactTelegram || user.telegramUsername || user.telegramId || '—'} · VK: {user.contactVkUrl || '—'} · связь: {user.contactEmail || '—'}</dd></div>
          <div><dt>Активность</dt><dd>{user.contestEntriesCount ?? 0} заявок · с {user.createdAt ? formatDate(user.createdAt) : 'неизвестной даты'}</dd></div>
        </dl>
      </div>
      <div className="contest-user-badges">
        <span className={user.blockedAt ? 'contest-role-blocked' : user.role === 'admin' ? 'contest-role-admin' : 'contest-role-user'}>
          {user.blockedAt ? 'заблокирован' : user.role === 'admin' ? 'админ' : 'участник'}
        </span>
        <span className={user.subscription?.hasAccess ? 'contest-access-ok' : 'contest-access-no'}>
          {user.lifetimeAccess ? 'полный доступ · навсегда' : user.manualAccess?.enabled && user.manualAccess.expiresAt ? `полный доступ · до ${formatDate(user.manualAccess.expiresAt)}` : user.subscription?.hasAccess ? 'подписка' : 'нет доступа'}
        </span>
        <div className="contest-user-action-menu-wrap">
          <button ref={node => { if (node) menuTriggerMap.set(user.id, node); else menuTriggerMap.delete(user.id); }} type="button" className="contest-user-menu-trigger" disabled={Boolean(actionId)} aria-label={`Действия с пользователем ${user.name || user.email || user.id}`} aria-haspopup="menu" aria-expanded={openMenuId === user.id} aria-controls={openMenuId === user.id ? `user-actions-${user.id}` : undefined} onClick={() => onToggleMenu(user.id)}>
            {actionId.startsWith(`${user.id}:`) ? <span className="admin-action-spinner" aria-hidden="true" /> : <MoreVertical size={20} />}
          </button>
          {openMenuId === user.id && (
            <div ref={menuRef} id={`user-actions-${user.id}`} className="contest-user-menu" role="menu" aria-label={`Действия: ${user.name || user.email}`}>
              <button type="button" role="menuitem" onClick={() => onOpenAccessDialog(user)}><CalendarClock size={16} /><span>{user.manualAccess?.enabled ? 'Изменить полный доступ' : 'Дать полный доступ'}<small>На период или навсегда</small></span></button>
              {user.manualAccess?.enabled && <button type="button" role="menuitem" onClick={() => onUpdateUser(user, { manualAccess: { enabled: false, expiresAt: null } })}><ShieldCheck size={16} /><span>Отозвать полный доступ<small>Обычная подписка пользователя сохранится</small></span></button>}
              <button type="button" role="menuitem" disabled={currentUserId === user.id} onClick={() => onUpdateUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })}><Users size={16} /><span>{user.role === 'admin' ? 'Снять права администратора' : 'Сделать администратором'}<small>Изменить уровень управления</small></span></button>
              <hr className="contest-user-menu-divider" />
              <button type="button" role="menuitem" className={!user.blockedAt ? 'is-danger' : undefined} disabled={currentUserId === user.id} onClick={() => onUpdateUser(user, { blocked: !user.blockedAt })}><Trash2 size={16} /><span>{user.blockedAt ? 'Разблокировать' : 'Заблокировать'}<small>{user.blockedAt ? 'Вернуть доступ к аккаунту' : 'Закрыть вход и исключить из рассылки'}</small></span></button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
