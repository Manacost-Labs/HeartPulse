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
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, COMMUNITY_TABS, TABS, type TabId } from '../routing/navigationRoutes';
import { closeModePanels, useModePanels, useNavigationMode } from './useModePanels';
import type { AuthUser } from '../../modules/identity/public';

export function PublicNavigationController({ activeTab, pathname, access, navigate, updatedAtLabel }: {
  activeTab: TabId; pathname: string; access: { user: AuthUser | null; checking: boolean; admin: boolean; contestAdmin: boolean };
  navigate: (path: string) => void; updatedAtLabel: string;
}) {
  const [menu, setMenu] = useState(false);
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
  const mode = useNavigationMode(activeTab);
  useModePanels();
  useEffect(() => { setMenu(false); }, [pathname]);
  // A drawer that closes takes its open mode panel along; the next opening starts folded.
  useEffect(() => { if (!menu) closeModePanels(); }, [menu]);
  const visit = (path: string) => {
    // Next must save the reading position after the drawer releases its lock.
    if (menu) flushSync(() => setMenu(false));
    navigate(path);
  };
  return <PublicNavigation activeTab={activeTab} mobileMenuOpen={menu} mode={mode}
    compact={compact} badges={badges}
    visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    visibleCommunityTabs={COMMUNITY_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
    appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel={updatedAtLabel} mobileMenuRef={menuRef}
    mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />}
    sidebarProfile={<HeaderProfileButton user={access.user} checking={access.checking} />} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
    onNavigate={tab => visit(TABS.find(item => item.id === tab)?.path ?? '/')}
    onNavigateLogin={() => visit('/?login')}
    onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={closeMenu}
    onToggleCompact={toggleCompact} />;
}
