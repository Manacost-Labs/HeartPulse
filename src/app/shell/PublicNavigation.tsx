import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';
import {
  NavigationRouteLinks, NavigationModeLists, NavigationModePicker,
  type NavigationBadges, type NavigationRoute,
} from './NavigationItems';
import type { ReactNode, RefObject } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import {
  ADMIN_TABS,
  BATTLEGROUNDS_TABS,
  HOME_TABS,
  STANDARD_TABS,
  modeOfTab,
  type TabId,
} from '../routing/navigationRoutes';
import type { NavigationModeId } from '../routing/navigationData';

export type PublicNavigationProps = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  /** The mode whose items the menu lists: the page's own, else the last chosen one. */
  mode: NavigationModeId;
  /** Desktop rail of icons with tooltips instead of the full sidebar. */
  compact: boolean;
  badges: NavigationBadges;
  visibleArenaTabs: readonly NavigationRoute[];
  visibleCommunityTabs: readonly NavigationRoute[];
  appIsContestAdmin: boolean;
  wantsLogin: boolean;
  updatedAtLabel: string;
  mobileMenuRef: RefObject<HTMLElement | null>;
  mobileMenuToggleRef: RefObject<HTMLButtonElement | null>;
  mobileProfile: ReactNode;
  sidebarProfile: ReactNode;
  profileLabel: string;
  onNavigate: (tab: TabId) => void;
  onNavigateLogin: () => void;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onToggleCompact: () => void;
};

type TreeProps = Pick<PublicNavigationProps, 'activeTab' | 'appIsContestAdmin' | 'badges' | 'mode' | 'onNavigate' | 'visibleArenaTabs' | 'visibleCommunityTabs'> & {
  variant: 'mobile' | 'sidebar';
};

/** The mode switch and «Главная» stay above the list, in that order; the list scrolls on a low window while the switch's panel opens beside it. */
function NavigationTree({ variant, activeTab, appIsContestAdmin, badges, mode, onNavigate, visibleArenaTabs, visibleCommunityTabs }: TreeProps) {
  const linkProps = { activeTab, variant, badges, onNavigate };
  const pageMode = modeOfTab(activeTab);
  return <>
    <div className="hp-nav-top">
      <NavigationModePicker variant={variant} mode={mode} pageMode={pageMode} onNavigate={onNavigate} />
      <NavigationRouteLinks routes={HOME_TABS} {...linkProps} />
    </div>
    <div className="hp-nav-scroll">
      <NavigationModeLists {...linkProps} pageMode={pageMode}
        routesOf={{ standard: STANDARD_TABS, arena: visibleArenaTabs, battlegrounds: BATTLEGROUNDS_TABS, community: visibleCommunityTabs }} />
      {appIsContestAdmin && <div className="hp-nav-admin">
        <NavigationRouteLinks routes={ADMIN_TABS} {...linkProps} />
      </div>}
    </div>
  </>;
}

// The drawer is a native popover, so the toggle opens it before React has
// hydrated; afterwards the click handler takes over and the shell's state
// drives the popover (useMobileMenuPopover).
function MobileTopbar({ mobileMenuOpen, mobileMenuToggleRef, onCloseMobileMenu, onNavigate, onToggleMobileMenu }: PublicNavigationProps) {
  return (
    <header className="arena-mobile-topbar lg:hidden">
      <a href="/" onClick={event => { if (!isPlainNavigationClick(event)) return; event.preventDefault(); onCloseMobileMenu(); onNavigate('home'); }} className="arena-mobile-brand" aria-label="HearthPulse — на главную">
        <img src="/hearthpulse-logo.webp" alt="" />
        <span>HearthPulse</span>
      </a>
      <button
        ref={mobileMenuToggleRef}
        type="button"
        popoverTarget="arena-mobile-menu"
        onClick={event => { event.preventDefault(); onToggleMobileMenu(); }}
        className="arena-mobile-nav-toggle"
        aria-expanded={mobileMenuOpen}
        aria-controls="arena-mobile-menu"
        aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
      >
        {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
    </header>
  );
}

function MobileMenu(props: PublicNavigationProps) {
  const { mobileMenuOpen, mobileMenuRef, mobileProfile, onCloseMobileMenu, onNavigate, onNavigateLogin, profileLabel, wantsLogin } = props;
  // Always rendered, closed: the server HTML carries the drawer, so its links
  // work before hydration. `data-open` shows it where popovers are unsupported.
  // Every link closes the drawer as the page leaves: the scroll lock is released
  // first, so the history entry keeps the reader's position for Back.
  return (
    <>
      <nav ref={mobileMenuRef} id="arena-mobile-menu" popover="auto" data-open={mobileMenuOpen ? '' : undefined} data-page-mode={modeOfTab(props.activeTab) ?? undefined}
        className="arena-mobile-menu hp-nav lg:hidden" aria-label="Мобильная навигация">
        <NavigationTree {...props} variant="mobile" onNavigate={(tab: TabId) => { onCloseMobileMenu(); onNavigate(tab); }} />
        <a href="/?login" onClick={event => { if (!isPlainNavigationClick(event)) return; event.preventDefault(); onCloseMobileMenu(); onNavigateLogin(); }} className={`arena-mobile-menu-link arena-mobile-menu-profile ${wantsLogin ? 'arena-mobile-menu-link-active' : ''}`} aria-label={profileLabel}>
          {mobileProfile}
        </a>
      </nav>
      {/* After the drawer: CSS shows it only next to an open drawer. */}
      <button type="button" className="arena-mobile-drawer-backdrop lg:hidden" aria-label="Закрыть меню" onClick={onCloseMobileMenu} />
    </>
  );
}

function DesktopSidebar(props: PublicNavigationProps) {
  const { compact, onNavigate, onNavigateLogin, onToggleCompact, profileLabel, sidebarProfile, wantsLogin } = props;
  return (
    <aside className="arena-sidebar" aria-label="Основная навигация">
      <div className="arena-sidebar-head">
        <a
          href="/"
          onClick={event => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            onNavigate('home');
          }}
          className="arena-sidebar-brand"
          aria-label="HearthPulse — на главную"
          data-nav-tip="Главная"
        >
          <img className="arena-sidebar-brand-logo" src="/hearthpulse-logo.webp" alt="" />
          <span className="arena-sidebar-brand-copy arena-nav-label">
            <strong>HearthPulse</strong>
          </span>
        </a>
        {/* The layout reads the remembered choice before first paint (lib/navigationPreference.ts). */}
        <button type="button" className="arena-sidebar-compact-toggle" aria-pressed={compact} onClick={onToggleCompact}
          aria-label={compact ? 'Развернуть меню' : 'Свернуть меню'} data-nav-tip={compact ? 'Развернуть меню' : 'Свернуть меню'}>
          {compact ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
        </button>
      </div>

      <nav className="arena-sidebar-nav hp-nav" aria-label="Разделы сайта" data-page-mode={modeOfTab(props.activeTab) ?? undefined}>
        <NavigationTree {...props} variant="sidebar" />
      </nav>

      <a
        href="/?login"
        onClick={event => {
          if (!isPlainNavigationClick(event)) return;
          event.preventDefault();
          onNavigateLogin();
        }}
        className={`arena-sidebar-profile ${wantsLogin ? 'arena-sidebar-profile-active' : ''}`}
        aria-label={profileLabel}
        data-nav-tip={profileLabel}
        style={{ textDecoration: 'none' }}
      >
        {sidebarProfile}
      </a>
      <div className="arena-nav-tooltip" aria-hidden="true" />
    </aside>
  );
}

export function PublicNavigation(props: PublicNavigationProps) {
  return (
    <>
      <MobileTopbar {...props} />
      <MobileMenu {...props} />
      <DesktopSidebar {...props} />
    </>
  );
}
