import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';
import {
  NavigationRouteLinks, NavigationSection, NavigationGroupControl,
  type NavigationBadges, type NavigationRoute, type NavigationGroup,
} from './NavigationItems';
import type { ReactNode, RefObject } from 'react';
import { Castle, Layers, Menu, PanelLeftClose, PanelLeftOpen, Ticket, X } from 'lucide-react';
import {
  ADMIN_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  STANDARD_TABS,
  TOP_LEVEL_TABS,
  type TabId,
} from '../routing/navigationRoutes';

export type PublicNavigationProps = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  /** Groups open in the drawer and in the sidebar. They open independently, so an opening group never moves the one above it. */
  mobileNavGroups: ReadonlySet<NavigationGroup>;
  sidebarNavGroups: ReadonlySet<NavigationGroup>;
  /** Desktop rail of icons with tooltips instead of the full sidebar. */
  compact: boolean;
  badges: NavigationBadges;
  visibleArenaTabs: readonly NavigationRoute[];
  visibleMiscTabs: readonly NavigationRoute[];
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
  onToggleMobileNavGroup: (group: NavigationGroup) => void;
  onToggleSidebarNavGroup: (group: NavigationGroup) => void;
  onToggleCompact: () => void;
};

/** Game modes of the menu, each with its own emblem; the tooltip of a compact item names its mode. */
const SECTIONS = {
  standard: { title: 'Традиционный режим', context: 'Традиционный', icon: Layers },
  arena: { title: 'Арена', context: 'Арена', icon: Ticket },
  battlegrounds: { title: 'Поля Сражений', context: 'Поля Сражений', icon: Castle },
} as const;

function NavigationTree({ variant, activeTab, appIsContestAdmin, badges, openGroups, onNavigate, onToggleGroup, visibleArenaTabs, visibleMiscTabs }: {
  variant: 'mobile' | 'sidebar';
  activeTab: TabId;
  appIsContestAdmin: boolean;
  badges: NavigationBadges;
  openGroups: ReadonlySet<NavigationGroup>;
  onNavigate: (tab: TabId) => void;
  onToggleGroup: (group: NavigationGroup) => void;
  visibleArenaTabs: readonly NavigationRoute[];
  visibleMiscTabs: readonly NavigationRoute[];
}) {
  const linkProps = { activeTab, variant, badges, onNavigate };
  const groupRoutes = { constructors: BG_BUILDER_TABS, misc: visibleMiscTabs };
  const section = (key: keyof typeof SECTIONS, routes: readonly NavigationRoute[]) => <>
    <NavigationSection title={SECTIONS[key].title} icon={SECTIONS[key].icon} variant={variant} />
    <NavigationRouteLinks routes={routes} context={SECTIONS[key].context} {...linkProps} />
  </>;
  const group = (key: NavigationGroup, title: string) => (
    <NavigationGroupControl active={groupRoutes[key].some(tab => tab.id === activeTab)} group={key}
      isOpen={openGroups.has(key)} onToggle={() => onToggleGroup(key)} title={title} variant={variant}>
      <NavigationRouteLinks routes={groupRoutes[key]} context={title} {...linkProps} sublink />
    </NavigationGroupControl>
  );
  return <>
    <NavigationRouteLinks routes={TOP_LEVEL_TABS} {...linkProps} />
    {appIsContestAdmin && <NavigationRouteLinks routes={ADMIN_TABS} {...linkProps} />}
    {section('standard', STANDARD_TABS)}
    {section('arena', visibleArenaTabs)}
    {section('battlegrounds', BG_PRIMARY_TABS)}
    {group('constructors', 'Конструкторы')}
    {group('misc', 'Разное')}
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
  const { mobileMenuOpen, mobileMenuRef, mobileNavGroups, mobileProfile, onCloseMobileMenu, onNavigate, onNavigateLogin, onToggleMobileNavGroup, profileLabel, wantsLogin } = props;
  // Always rendered, closed: the server HTML carries the drawer, so its links
  // work before hydration. `data-open` shows it where popovers are unsupported.
  // Every link closes the drawer as the page leaves: the scroll lock is released
  // first, so the history entry keeps the reader's position for Back.
  return (
    <>
      <nav ref={mobileMenuRef} id="arena-mobile-menu" popover="auto" data-open={mobileMenuOpen ? '' : undefined} className="arena-mobile-menu lg:hidden" aria-label="Мобильная навигация">
        <NavigationTree {...props} variant="mobile" openGroups={mobileNavGroups} onToggleGroup={onToggleMobileNavGroup}
          onNavigate={(tab: TabId) => { onCloseMobileMenu(); onNavigate(tab); }} />
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
  const { compact, onNavigate, onNavigateLogin, onToggleCompact, onToggleSidebarNavGroup, profileLabel, sidebarNavGroups, sidebarProfile, wantsLogin } = props;
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

      <nav className="arena-sidebar-nav" aria-label="Разделы сайта">
        <NavigationTree {...props} variant="sidebar" openGroups={sidebarNavGroups} onToggleGroup={onToggleSidebarNavGroup} />
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
