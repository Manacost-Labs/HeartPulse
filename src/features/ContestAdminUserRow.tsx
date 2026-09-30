import type React from 'react';
import { personAccess, personContacts, personInitial } from '../modules/adminCrm/public';
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
  tags?: string[];
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
  onToggleMenu: (userId: string) => void;
  onOpenAccessDialog: (user: AdminUserSearchResult) => void;
  onUpdateUser: (user: AdminUserSearchResult, patch: AdminUserPatch) => void;
  onOpenPerson?: (user: AdminUserSearchResult) => void;
};

export function ContestAdminUserRow({ currentUserId, user, actionId, openMenuId, menuRef, menuTriggerMap, onToggleMenu, onOpenAccessDialog, onUpdateUser, onOpenPerson }: ContestAdminUserRowProps) {
  const access = personAccess(user);
  const contacts = personContacts(user);
  const name = user.name || 'Без имени';
  return (
    <tr className="admin-people-row">
      <td className="admin-people-cell-person">
        <div className="admin-people-person">
          <span className="admin-people-avatar" aria-hidden="true">{personInitial(user)}</span>
          <div>
            {onOpenPerson
              ? <button type="button" className="admin-crm-open" aria-haspopup="dialog" onClick={() => onOpenPerson(user)}>{name}</button>
              : <strong>{name}</strong>}
            <small>{user.email || 'email не указан'}</small>
            <small>ID {user.profileId}{user.country ? ` · ${user.country}` : ''}{user.role === 'admin' ? ' · администратор' : ''}</small>
          </div>
        </div>
      </td>
      <td data-label="Доступ">
        <span className={`admin-crm-pill is-${access.tone}`}>{access.label}</span>
        {access.detail && <small>{access.detail}</small>}
      </td>
      <td className="admin-people-contacts" data-label="Контакты">
        {contacts.length
          ? contacts.map(contact => <span key={contact.kind}><small>{contact.kind}</small>{contact.value}</span>)
          : <small>не указаны</small>}
      </td>
      <td data-label="Активность">
        <span>{user.contestEntriesCount ?? 0} заявок</span>
        <small>с {user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru-RU') : 'неизвестной даты'}</small>
      </td>
      <td data-label="Теги">
        {user.tags?.length
          ? <ul className="admin-crm-row-tags" aria-label="Теги">{user.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
          : <small>—</small>}
      </td>
      <td className="admin-people-actions">
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
      </td>
    </tr>
  );
}
