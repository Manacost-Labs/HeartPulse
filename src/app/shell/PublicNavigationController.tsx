import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePublicMenuFocus } from './usePublicMenuFocus';
import { useMobileMenuPopover } from './useMobileMenuPopover';
import { usePageScrollLock } from '../../hooks/usePageScrollLock';
import { PublicNavigation } from './PublicNavigation';
import { HeaderProfileButton } from './HeaderProfileButton';
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, MISC_TABS, TABS, type TabId } from '../routing/navigationRoutes';
import type { AuthUser } from '../../modules/identity/public';
import type { NavigationGroup } from './NavigationItems';

export function PublicNavigationController({ activeTab, pathname, access, navigate, updatedAtLabel }: {
  activeTab: TabId; pathname: string; access: { user: AuthUser | null; checking: boolean; admin: boolean; contestAdmin: boolean };
  navigate: (path: string) => void; updatedAtLabel: string;
}) {
  const [menu, setMenu] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<NavigationGroup>(null);
  const [sidebarGroup, setSidebarGroup] = useState<NavigationGroup>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  usePublicMenuFocus(menu, menuRef, toggleRef, setMenu);
  useMobileMenuPopover(menu, menuRef, setMenu);
  usePageScrollLock(menu);
  useEffect(() => { setMenu(false); }, [pathname]);
  const visit = (path: string) => {
    // Next must save the reading position after the drawer releases its lock.
    flushSync(() => setMenu(false));
    navigate(path);
  };
  return <PublicNavigation activeTab={activeTab} mobileMenuOpen={menu} mobileNavGroup={mobileGroup} sidebarNavGroup={sidebarGroup}
    visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    visibleMiscTabs={MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel={updatedAtLabel} mobileMenuRef={menuRef}
    mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />}
    sidebarProfile={<HeaderProfileButton user={access.user} checking={access.checking} />} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
    onNavigate={tab => visit(TABS.find(item => item.id === tab)?.path ?? '/')}
    onNavigateLogin={() => visit('/?login')}
    onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={() => setMenu(false)}
    onToggleMobileNavGroup={value => setMobileGroup(current => current === value ? null : value)}
    onToggleSidebarNavGroup={value => setSidebarGroup(current => current === value ? null : value)} />;
}
