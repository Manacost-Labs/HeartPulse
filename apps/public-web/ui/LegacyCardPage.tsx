'use client';
import { usePublicMenuFocus } from '../../../src/app/shell/usePublicMenuFocus';
import { usePageScrollLock } from '../../../src/hooks/usePageScrollLock';
import { useRef, useState } from 'react';
import StandardCards from '../../../src/features/StandardCards';
import { PublicNavigation } from '../../../src/app/shell/PublicNavigation';
import { HeaderProfileButton } from '../../../src/app/shell/HeaderProfileButton';
import GlobalUtilityHeader from '../../../src/components/GlobalUtilityHeader';
import SiteFooter from '../../../src/components/SiteFooter';
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, MISC_TABS, TABS } from '../../../src/app/routing/navigationRoutes';
import type { PublicCardSeed } from '../../../src/modules/constructedCards/public';
import { useCardAccess } from './useCardAccess';

const navigate = (path: string) => { window.location.assign(path); };
export function LegacyCardPage({ card, pathname, initialSearch }: { card: PublicCardSeed; pathname: string; initialSearch: string }) {
  const access = useCardAccess();
  const [menu, setMenu] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<'constructors' | 'misc' | null>(null);
  const [sidebarGroup, setSidebarGroup] = useState<'constructors' | 'misc' | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  usePublicMenuFocus(menu, menuRef, toggleRef, setMenu);
  usePageScrollLock(menu);
  const profile = <HeaderProfileButton user={access.user} checking={access.checking} />;
  return <div className="min-h-screen bg-wood text-[#3d2a1e] font-body arena-app-shell arena-app-game-data arena-app-standard-cards">
    <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
    <div className="arena-layout-shell">
      <PublicNavigation activeTab="standard-cards" mobileMenuOpen={menu} mobileNavGroup={mobileGroup} sidebarNavGroup={sidebarGroup}
        visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        visibleMiscTabs={MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel="Нет данных" mobileMenuRef={menuRef}
        mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />} sidebarProfile={profile} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
        onNavigate={tab => navigate(TABS.find(item => item.id === tab)?.slug ?? '/')}
        onNavigateLogin={() => navigate('/profile/')} onWarm={() => undefined}
        onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={() => setMenu(false)}
        onToggleMobileNavGroup={value => setMobileGroup(current => current === value ? null : value)}
        onToggleSidebarNavGroup={value => setSidebarGroup(current => current === value ? null : value)} />
      <div className="arena-workspace arena-workspace-with-tools arena-workspace-wide">
        <GlobalUtilityHeader accessStatus={access.admin || access.subscription} onNavigate={navigate} pagePath={pathname} auth={Boolean(access.user)} />
        <main id="main-content" tabIndex={-1} className="arena-main relative flex flex-col items-center arena-main-wide">
          <div className="arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 arena-content-wide arena-content-open">
            <StandardCards currentPath={pathname} initialCard={card} initialSearch={initialSearch} navigatePath={navigate}
              statsAccess={access.statsAccess} statsAccessLoading={access.checking} authUser={access.user} onRefreshSubscription={access.refresh} />
          </div>
        </main>
        <SiteFooter />
      </div>
    </div>
  </div>;
}
