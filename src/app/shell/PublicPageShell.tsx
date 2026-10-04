import { lazy, Suspense, useRef, useState, type ReactNode } from 'react';
import { preload } from 'react-dom';
import { usePublicMenuFocus } from './usePublicMenuFocus';
import { useMobileMenuPopover } from './useMobileMenuPopover';
import { usePageScrollLock } from '../../hooks/usePageScrollLock';
import { PublicNavigation } from './PublicNavigation';
import { HeaderProfileButton } from './HeaderProfileButton';
import GlobalUtilityHeader from '../../components/GlobalUtilityHeader';
import SiteFooter from '../../components/SiteFooter';
import { OptionalSurface } from '../../components/OptionalSurface';
import { ADMIN_ONLY_TAB_IDS, ARENA_TABS, BG_TAB_IDS, MISC_TABS, TABS, type TabId } from '../routing/navigationRoutes';
import type { AuthUser } from '../../modules/identity/public';
import type { SubscriptionStatus } from '../../modules/subscriptions/public';

// The delayed support prompt stays out of the initial route bundle. The page
// works without it, so a chunk that cannot load must not fail the page.
const SupportPrompt = lazy(() => import('../../components/SupportPrompt'));

/** Same file as `--arena-parchment-texture` in `src/styles/tokens.css`. */
const PARCHMENT_TEXTURE_URL = '/wallpaper/arena-parchment-v2.webp';
/** Below this width some pages paint text, banner art or an image first (measured at 390-640px). */
const PARCHMENT_TABLET_UP = '(min-width: 768px)';

type Access = { user: AuthUser | null; checking: boolean; admin: boolean; contestAdmin: boolean; subscription: SubscriptionStatus | null };
// Route styles are scoped by these classes: account pages and the home page
// have their own surfaces; every other page is editorial, Battlegrounds or
// game data plus its tab.
function surfaceClasses(activeTab: TabId, editorial: boolean, account: boolean): string {
  if (account) return 'arena-app-profile';
  if (activeTab === 'home') return 'arena-app-home';
  const surface = editorial ? 'editorial' : BG_TAB_IDS.has(activeTab) ? 'battlegrounds' : 'game-data';
  return `arena-app-${surface} arena-app-${activeTab}`;
}

export function PublicPageShell({ children, activeTab, pathname, access, navigate, editorial = false, account = false, wide = false, updatedAtLabel = 'Нет данных', parchmentPreload = 'always' }: {
  children: ReactNode; activeTab: TabId; pathname: string; access: Access; navigate: (path: string) => void; editorial?: boolean; account?: boolean; wide?: boolean; updatedAtLabel?: string;
  /** `tablet-up` on a page whose measured phone LCP is not the parchment (text, banner art, an image). */
  parchmentPreload?: 'always' | 'tablet-up';
}) {
  // The parchment behind the workspace is the largest paint of most pages, and
  // as a CSS background it is found only after every stylesheet. During server
  // rendering React sends this high-priority hint in the Link response header,
  // ahead of the CSS. Where it is not the LCP, `media` keeps phones from
  // fetching it early; they still load it once, from the CSS.
  preload(PARCHMENT_TEXTURE_URL, { as: 'image', fetchPriority: 'high',
    ...(parchmentPreload === 'tablet-up' ? { media: PARCHMENT_TABLET_UP } : {}) });
  const [menu, setMenu] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<'constructors' | 'misc' | null>(null);
  const [sidebarGroup, setSidebarGroup] = useState<'constructors' | 'misc' | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  usePublicMenuFocus(menu, menuRef, toggleRef, setMenu);
  useMobileMenuPopover(menu, menuRef, setMenu);
  usePageScrollLock(menu);
  const profile = <HeaderProfileButton user={access.user} checking={access.checking} />;
  return <div className={`min-h-screen bg-wood text-[#3d2a1e] font-body arena-app-shell ${surfaceClasses(activeTab, editorial, account)}`}>
    <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
    <div className="arena-layout-shell">
      <PublicNavigation activeTab={activeTab} mobileMenuOpen={menu} mobileNavGroup={mobileGroup} sidebarNavGroup={sidebarGroup}
        visibleArenaTabs={ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        visibleMiscTabs={MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || access.admin)}
        appIsContestAdmin={access.contestAdmin} wantsLogin={false} updatedAtLabel={updatedAtLabel} mobileMenuRef={menuRef}
        mobileMenuToggleRef={toggleRef} mobileProfile={<HeaderProfileButton user={access.user} checking={access.checking} variant="mobile" />} sidebarProfile={profile} profileLabel={access.user || access.checking ? 'Открыть профиль' : 'Войти'}
        onNavigate={tab => navigate(TABS.find(item => item.id === tab)?.path ?? '/')}
        onNavigateLogin={() => navigate('/?login')}
        onToggleMobileMenu={() => setMenu(value => !value)} onCloseMobileMenu={() => setMenu(false)}
        onToggleMobileNavGroup={value => setMobileGroup(current => current === value ? null : value)}
        onToggleSidebarNavGroup={value => setSidebarGroup(current => current === value ? null : value)} />
      <div className={`arena-workspace arena-workspace-with-tools ${wide ? 'arena-workspace-wide' : ''}`}>
        <GlobalUtilityHeader accessStatus={access.admin || access.subscription} onNavigate={navigate} pagePath={pathname} auth={Boolean(access.user)} />
        <main id="main-content" tabIndex={-1} className={`arena-main relative flex flex-col items-center ${wide ? 'arena-main-wide' : ''}`}>
          <div className={`arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 ${wide ? 'arena-content-wide' : ''} arena-content-open`}>
            {/* The head's `rel=expect` waits for this marker only: the content box exists
                for the page transition while the first paint does not wait for the rest. */}
            <span id="route-content-start" hidden />
            {children}
          </div>
        </main>
        <SiteFooter />
        <OptionalSurface scope="support-prompt"><Suspense fallback={null}><SupportPrompt /></Suspense></OptionalSurface>
      </div>
    </div>
  </div>;
}
