import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminCrmSegmentId } from '../../../modules/adminCrm/public';
import { fetchWithDeadline } from '../../../shared/http/fetchWithDeadline';
import { ContestAdminUsers, type AdminUserPatch, type AdminUserSearchResult } from '../../ContestAdminUsers';
import { useAdminUsersList } from '../../useAdminUsersList';
import { authJsonHeaders, errorText, formatDate, readResponseJson, type AdminMessageSink } from '../adminSectionKit';

/**
 * The open row menu of the people table: closes on outside press, Escape and focus leaving it;
 * arrows, Home and End move between its items; Tab leaves it towards the next control.
 */
function useUserActionMenu() {
  const [openId, setOpenId] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerMap = useMemo(() => new Map<string, HTMLButtonElement>(), []);
  // A section hidden by the console unmounts its effects; a menu left open must not come back open.
  useEffect(() => () => setOpenId(''), []);

  useEffect(() => {
    if (!openId) return;
    const closeMenu = (restoreFocus: boolean) => {
      const trigger = triggerMap.get(openId);
      setOpenId('');
      if (restoreFocus) trigger?.focus({ preventScroll: true });
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)
        && !triggerMap.get(openId)?.contains(event.target as Node)) {
        closeMenu(false);
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerMap.get(openId)?.contains(target)) setOpenId('');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        const trigger = triggerMap.get(openId);
        const focusable = Array.from(document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter(item => !menuRef.current?.contains(item) && (item.offsetWidth > 0 || item.offsetHeight > 0));
        const triggerIndex = trigger ? focusable.indexOf(trigger) : -1;
        const targetIndex = event.shiftKey
          ? Math.max(0, triggerIndex - 1)
          : Math.min(focusable.length - 1, triggerIndex + 1);
        const target = focusable[targetIndex] || trigger;
        setOpenId('');
        target?.focus({ preventScroll: true });
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items: HTMLButtonElement[] = menuRef.current
        ? Array.from(menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
        : [];
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : event.key === 'ArrowDown'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      items[nextIndex]?.focus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, [openId, triggerMap]);

  const toggle = useCallback((userId: string) => setOpenId(current => (current === userId ? '' : userId)), []);
  const close = useCallback(() => setOpenId(''), []);
  return { openId, menuRef, triggerMap, toggle, close };
}

function userActionLabel(patch: AdminUserPatch): string {
  if (patch.manualAccess) {
    if (!patch.manualAccess.enabled) return 'отозвать полный доступ';
    return patch.manualAccess.expiresAt
      ? `дать полный доступ до ${formatDate(patch.manualAccess.expiresAt)}`
      : 'дать полный доступ навсегда';
  }
  if (typeof patch.lifetimeAccess === 'boolean') return patch.lifetimeAccess ? 'дать бессрочную подписку' : 'отозвать бессрочную подписку';
  if (patch.blocked === true) return 'заблокировать';
  if (patch.blocked === false) return 'разблокировать';
  return patch.role === 'admin' ? 'сделать администратором' : 'снять права администратора';
}

export type UsersSegmentRequest = { segment: AdminCrmSegmentId; at: number };

/** The people section: search, CRM segments, paging and the per-person access actions. */
export function UsersSection({ currentUserId, segmentRequest, onMessage }: {
  currentUserId?: string;
  /** An overview card asked for a segment (the time makes a repeated request for the same one count). */
  segmentRequest: UsersSegmentRequest | null;
  onMessage: AdminMessageSink;
}) {
  const usersList = useAdminUsersList(true, text => onMessage({ type: 'err', text }));
  const [actionId, setActionId] = useState('');
  const menu = useUserActionMenu();
  const { changeSegment } = usersList;
  // Effects run again each time the console shows this section; a request is applied only once.
  const appliedRequestRef = useRef(0);
  useEffect(() => {
    if (!segmentRequest || segmentRequest.at <= appliedRequestRef.current) return;
    appliedRequestRef.current = segmentRequest.at;
    changeSegment({ segment: segmentRequest.segment, tag: '' });
  }, [changeSegment, segmentRequest]);

  const updateUser = async (user: AdminUserSearchResult, patch: AdminUserPatch) => {
    const menuTrigger = menu.triggerMap.get(user.id);
    const confirmed = window.confirm(`Точно ${userActionLabel(patch)} пользователя ${user.name || user.email || user.id}?`);
    menu.close();
    menuTrigger?.focus({ preventScroll: true });
    if (!confirmed) return;
    setActionId(`${user.id}:${Object.keys(patch).join(',')}`);
    onMessage(null);
    try {
      const response = await fetchWithDeadline(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PATCH',
        headers: authJsonHeaders(),
        body: JSON.stringify(patch),
      });
      const data = await readResponseJson(response);
      if (!response.ok) throw new Error(typeof data.error === 'string' && data.error ? data.error : 'Не удалось обновить пользователя');
      onMessage({ type: 'ok', text: `Пользователь обновлен: ${user.name || user.email || user.id}.` });
      usersList.reload();
    } catch (error) {
      onMessage({ type: 'err', text: errorText(error, 'Не удалось обновить пользователя') });
    } finally {
      setActionId('');
    }
  };

  return (
    <ContestAdminUsers
      currentUserId={currentUserId}
      users={usersList.users}
      total={usersList.total}
      loading={usersList.loading}
      query={usersList.query}
      page={usersList.page}
      pageCount={usersList.pageCount}
      actionId={actionId}
      openMenuId={menu.openId}
      menuRef={menu.menuRef}
      menuTriggerMap={menu.triggerMap}
      onRefresh={usersList.reload}
      onQueryChange={usersList.setQuery}
      onPageChange={usersList.setPage}
      onToggleMenu={menu.toggle}
      onUpdateUser={(user, patch) => void updateUser(user, patch)}
      segments={usersList.segments}
      segment={usersList.segment}
      tag={usersList.tag}
      onSegmentChange={usersList.changeSegment}
      onPersonChanged={usersList.reload}
    />
  );
}
