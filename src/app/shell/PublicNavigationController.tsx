import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { usePublicMenuFocus } from './usePublicMenuFocus';
import { useMobileMenuPopover } from './useMobileMenuPopover';
import { useDrawerGesture } from './useDrawerGesture';
import { useCompactNavigation, useNavigationTooltip, usePressedNavigationLink } from './useNavigationFeedback';
import { useNavigationBadges } from './patchNotesBadge';
import { usePageScrollLock } from '../../hooks/usePageScrollLock';
import { PublicNavigation } from './PublicNavigation';
import { HeaderProfileButton } from './HeaderProfileButton';
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, BG_BUILDER_TABS, MISC_TABS, TABS, type TabId } from '../routing/navigationRoutes';
import type { AuthUser } from '../../modules/identity/public';
import type { NavigationGroup } from './NavigationItems';

/** The group holding the current page starts open, so its item is visible on arrival. */
function groupOf(tab: TabId): NavigationGroup | null {
  if (BG_BUILDER_TABS.some(route => route.id === tab)) return 'constructors';
  if (MISC_TABS.some(route => route.id === tab)) return 'misc';
  return null;
}

function toggled(groups: ReadonlySet<NavigationGroup>, group: NavigationGroup): ReadonlySet<NavigationGroup> {
  const next = new Set(groups);
  if (!next.delete(group)) next.add(group);
  return next;
}

export function PublicNavigationController({ activeTab, pathname, access, navigate, updatedAtLabel }: {
  activeTab: TabId; pathname: string; access: { user: AuthUser | null; checking: boolean; admin: boolean; contestAdmin: boolean };
  navigate: (path: string) => void; updatedAtLabel: string;
}) {
  const [menu, setMenu] = useState(false);
  const [mobileGroups, setMobileGroups] = useState<ReadonlySet<NavigationGroup>>(() => new Set([groupOf(activeTab)].filter(Boolean) as NavigationGroup[]));
  const [sidebarGroups, setSidebarGroups] = useState<ReadonlySet<NavigationGroup>>(mobileGroups);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const [compact, toggleCompact] = useCompactNavigation();
  const badges = useNavigationBadges(pathname);
  const closeMenu = useCallback(() => setMenu(false), []);
  usePublicMenuFocus(menu, menuRef, toggleRef, setMenu);
  useMobileMenuPopover(menu, menuRef, setMenu);
  useDrawerGesture(menu, menuRef, closeMenu);
  usePageScrollLock(menu);
  usePressedNavigationLink(activeTab);
  useNavigationTooltip(compact);
  useEffect(() => { setMenu(false); }, [pathname]);
  const visit = (path: string) => {
    // Next must save the reading position after the drawer releases its lock.
    if (menu) flushSync(() => setMenu(false));
    navigate(path);
  };
  return <PublicNavigation activeTab={activeTab} mobileMenuOpen={menu} mobileNavGroups={mobileGroups} sidebarNavGroups={sidebarGroups}
    compact={compact} badges={badges}
    visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    visibleMiscTabs={MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel={updatedAtLabel} mobileMenuRef={menuRef}
    mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />}
    sidebarProfile={<HeaderProfileButton user={access.user} checking={access.checking} />} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
    onNavigate={tab => visit(TABS.find(item => item.id === tab)?.path ?? '/')}
    onNavigateLogin={() => visit('/?login')}
    onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={closeMenu}
    onToggleMobileNavGroup={group => setMobileGroups(current => toggled(current, group))}
    onToggleSidebarNavGroup={group => setSidebarGroups(current => toggled(current, group))}
    onToggleCompact={toggleCompact} />;
}
