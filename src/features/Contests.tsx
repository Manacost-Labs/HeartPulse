import React, { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import '../route-parchment.css';
import { ShieldCheck } from 'lucide-react';
import './contests.css';
import '../shared/ui/LoadingSurface.css';
import { LoadingSurface } from '../shared/ui/LoadingSurface';
import {
  canAccessAdminWorkspace,
  canManageContests,
} from '../modules/identity/public';
import type { AuthUser } from '../modules/identity/public';
import type { AdminCrmSegmentId } from '../modules/adminCrm/public';
import {
  adminWorkspaceReducer,
  createAdminWorkspaceState,
  type AdminMessage,
  type AdminWorkspaceSection,
} from './adminWorkspaceState';
import { AdminConsoleShell } from './adminConsole/AdminConsoleShell';
import {
  ADMIN_NAV_ITEMS,
  CONTEST_ADMIN_NAV_ITEMS,
  adminSectionFromSearch,
} from './adminConsole/adminNavigation';
import { prefetchSectionCode } from './adminConsole/sectionPreload';
import { renderAdminSection, type AdminSectionContext } from './adminConsole/AdminSections';
import type { UsersSegmentRequest } from './adminConsole/sections/UsersSection';
import { AdminSectionFrame } from './AdminSectionFrame';
export { ContestsPage } from '../modules/contests/public';

/** The shared loading panel, holding the height of the admin section that replaces it. */
function RouteFallback({ minHeight = 520 }: { minHeight?: number }) {
  return <div style={{ width: '100%', ['--loading-surface-min-block' as string]: `${minHeight}px` }}>
    <LoadingSurface label="Загружаем раздел" />
  </div>;
}

/** The section a manager may open: contest-only managers always land in contests. */
function permittedSection(fullAccess: boolean, defaultSection = fullAccess ? 'dashboard' as const : 'contests' as const): AdminWorkspaceSection {
  const requested = adminSectionFromSearch(window.location.search, defaultSection);
  return fullAccess || requested === 'contests' ? requested : 'contests';
}

/**
 * The admin panel: who may open which section, the address bar and history, the toast and the
 * console frame. Each section owns its own state and data (src/features/adminConsole/sections),
 * so typing in one section never re-renders the panel or the others.
 */
export function ContestAdminPanel({ authUser, authChecking = false }: { authUser: AuthUser | null; authChecking?: boolean }) {
  const allowed = canManageContests(authUser);
  const hasFullAdminAccess = canAccessAdminWorkspace(authUser);
  const [adminWorkspace, dispatchAdminWorkspace] = useReducer(
    adminWorkspaceReducer,
    createAdminWorkspaceState(permittedSection(hasFullAdminAccess)),
  );
  const { section: adminSection, message } = adminWorkspace;
  const [usersSegmentRequest, setUsersSegmentRequest] = useState<UsersSegmentRequest | null>(null);
  const setMessage = useCallback((nextMessage: AdminMessage | null) => {
    dispatchAdminWorkspace({ type: 'setMessage', message: nextMessage });
  }, []);
  // A success toast covers the page toolbar on narrow screens, so it leaves on its own; errors stay until dismissed.
  useEffect(() => {
    if (message?.type !== 'ok') return undefined;
    const timer = window.setTimeout(() => setMessage(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [message, setMessage]);

  const changeAdminSection = useCallback((section: AdminWorkspaceSection, options?: { replace?: boolean }) => {
    const nextSection = hasFullAdminAccess || section === 'contests' ? section : 'contests';
    dispatchAdminWorkspace({ type: 'navigate', section: nextSection });

    const url = new URL(window.location.href);
    const alreadyActive = url.searchParams.get('section') === nextSection;
    url.searchParams.set('section', nextSection);
    const method = options?.replace || alreadyActive ? 'replaceState' : 'pushState';
    window.history[method]({ adminSection: nextSection }, '', `${url.pathname}${url.search}${url.hash}`);
  }, [hasFullAdminAccess]);

  useEffect(() => {
    if (authChecking || !allowed) return;
    changeAdminSection(permittedSection(hasFullAdminAccess), { replace: true });
  }, [allowed, authChecking, changeAdminSection, hasFullAdminAccess]);

  useEffect(() => {
    const handlePopState = () => dispatchAdminWorkspace({ type: 'navigate', section: permittedSection(hasFullAdminAccess) });
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [hasFullAdminAccess]);

  useEffect(() => {
    if (!allowed) return;
    const label = ADMIN_NAV_ITEMS.find(item => item.id === adminSection)?.label ?? 'Админка';
    document.title = `${label} — Админка | HearthPulse`;
  }, [adminSection, allowed]);

  const sectionContext = useMemo<AdminSectionContext>(() => ({
    currentUserId: authUser?.id,
    adminEmail: authUser?.email || '',
    usersSegmentRequest,
    onMessage: setMessage,
    onCopy: async (text, okText = 'Скопировано.') => {
      try {
        await navigator.clipboard.writeText(text);
        setMessage({ type: 'ok', text: okText });
      } catch {
        setMessage({ type: 'err', text: 'Не удалось скопировать в буфер обмена.' });
      }
    },
    onNavigate: changeAdminSection,
    onOpenSegment: (segment: AdminCrmSegmentId) => {
      setUsersSegmentRequest({ segment, at: Date.now() });
      changeAdminSection('users');
    },
  }), [authUser?.email, authUser?.id, changeAdminSection, setMessage, usersSegmentRequest]);

  if (authChecking) {
    return (
      <section className="contest-admin-page admin-access-state">
        <RouteFallback minHeight={360} />
      </section>
    );
  }

  if (!allowed) {
    return (
      <section className="contest-admin-page admin-access-state">
        <div className="contest-empty">
          <ShieldCheck size={34} />
          <strong>Админ панель недоступна</strong>
          <span>Войдите в аккаунт администратора или запросите необходимые права.</span>
          <a className="contest-primary-button" href="/?login">Войти в профиль</a>
        </div>
      </section>
    );
  }

  return (
    <AdminConsoleShell
      navigation={hasFullAdminAccess ? ADMIN_NAV_ITEMS : CONTEST_ADMIN_NAV_ITEMS}
      activeSection={adminSection}
      accessLabel={hasFullAdminAccess ? 'Полный доступ' : 'Управление конкурсами'}
      userLabel={authUser?.name || authUser?.email || 'Администратор'}
      userTitle={authUser?.email || undefined}
      message={message}
      onNavigate={changeAdminSection}
      onIntent={hasFullAdminAccess ? prefetchSectionCode : undefined}
      onDismissMessage={() => setMessage(null)}
    >
      <AdminSectionFrame section={adminSection} renderSection={section => renderAdminSection(section, sectionContext)} />
    </AdminConsoleShell>
  );
}
