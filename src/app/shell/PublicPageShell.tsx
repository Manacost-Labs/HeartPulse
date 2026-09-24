import { useRef, useState, type ReactNode } from 'react';
import { usePublicMenuFocus } from './usePublicMenuFocus';
import { usePageScrollLock } from '../../hooks/usePageScrollLock';
import { PublicNavigation } from './PublicNavigation';
import { HeaderProfileButton } from './HeaderProfileButton';
import GlobalUtilityHeader from '../../components/GlobalUtilityHeader';
import SiteFooter from '../../components/SiteFooter';
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, MISC_TABS, TABS, type TabId } from '../routing/navigationRoutes';
import type { AuthUser } from '../../modules/identity/public';
import type { SubscriptionStatus } from '../../modules/subscriptions/public';

type Access = { user: AuthUser | null; checking: boolean; admin: boolean; contestAdmin: boolean; subscription: SubscriptionStatus | null };
export function PublicPageShell({ children, activeTab, pathname, access, navigate, editorial = false, wide = false, updatedAtLabel = 'Нет данных' }: {
  children: ReactNode; activeTab: TabId; pathname: string; access: Access; navigate: (path: string) => void; editorial?: boolean; wide?: boolean; updatedAtLabel?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<'constructors' | 'misc' | null>(null);
  const [sidebarGroup, setSidebarGroup] = useState<'constructors' | 'misc' | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  usePublicMenuFocus(menu, menuRef, toggleRef, setMenu);
  usePageScrollLock(menu);
  const profile = <HeaderProfileButton user={access.user} checking={access.checking} />;
  return <div className={`min-h-screen bg-wood text-[#3d2a1e] font-body arena-app-shell arena-app-${editorial ? 'editorial' : 'game-data'} arena-app-${activeTab}`}>
    <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
    <div className="arena-layout-shell">
      <PublicNavigation activeTab={activeTab} mobileMenuOpen={menu} mobileNavGroup={mobileGroup} sidebarNavGroup={sidebarGroup}
        visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        visibleMiscTabs={MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel={updatedAtLabel} mobileMenuRef={menuRef}
        mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />} sidebarProfile={profile} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
        onNavigate={tab => navigate(TABS.find(item => item.id === tab)?.slug ?? '/')}
        onNavigateLogin={() => navigate('/?login')} onWarm={() => undefined}
        onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={() => setMenu(false)}
        onToggleMobileNavGroup={value => setMobileGroup(current => current === value ? null : value)}
        onToggleSidebarNavGroup={value => setSidebarGroup(current => current === value ? null : value)} />
      <div className={`arena-workspace arena-workspace-with-tools ${wide ? 'arena-workspace-wide' : ''}`}>
        <GlobalUtilityHeader accessStatus={access.admin || access.subscription} onNavigate={navigate} pagePath={pathname} auth={Boolean(access.user)} />
        <main id="main-content" tabIndex={-1} className={`arena-main relative flex flex-col items-center ${wide ? 'arena-main-wide' : ''}`}>
          <div className={`arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 ${wide ? 'arena-content-wide' : ''} arena-content-open`}>
            {children}
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  </div>;
}
