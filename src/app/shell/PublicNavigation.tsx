import type { ReactNode, RefObject } from 'react';
import { ChevronDown, Gift, Grid3X3, Menu, X } from 'lucide-react';
import {
  ADMIN_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  STANDARD_TABS,
  TABS,
  TOP_LEVEL_TABS,
  type TabId,
} from '../../routes';

type NavigationRoute = (typeof TABS)[number];
type NavigationGroup = 'constructors' | 'misc' | null;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  sublink?: boolean;
  onNavigate: (tab: TabId) => void;
  onWarm: (tab: TabId) => void;
};

function NavigationRouteLinks({
  routes,
  activeTab,
  variant,
  sublink = false,
  onNavigate,
  onWarm,
}: NavigationRouteLinksProps) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  const iconSize = sublink ? 17 : variant === 'mobile' ? 18 : 19;
  return routes.map(tab => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <a
        key={tab.id}
        href={tab.slug}
        onPointerEnter={() => onWarm(tab.id)}
        onPointerDown={() => onWarm(tab.id)}
        onFocus={() => onWarm(tab.id)}
        onClick={event => {
          event.preventDefault();
          onNavigate(tab.id);
        }}
        aria-current={active ? 'page' : undefined}
        className={`${classPrefix}-link ${sublink ? `${classPrefix}-sublink ` : ''}${active ? `${classPrefix}-link-active` : ''}`}
        style={variant === 'sidebar' ? { textDecoration: 'none' } : undefined}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          <Icon size={iconSize} strokeWidth={1.8} />
        </span>
        <span>{tab.label}</span>
      </a>
    );
  });
}

function NavigationSection({
  title,
  caption,
  variant,
}: {
  title: string;
  caption: string;
  variant: 'mobile' | 'sidebar';
}) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  return (
    <div className={`${classPrefix}-section`} aria-label={`${title} — ${caption}`}>
      <span className={`${classPrefix}-section-title`}>{title}</span>
      <span className={`${classPrefix}-section-caption`}>{caption}</span>
    </div>
  );
}

function NavigationGroupControl({
  active,
  caption,
  children,
  group,
  isOpen,
  onToggle,
  title,
  variant,
}: {
  active: boolean;
  caption: string;
  children: ReactNode;
  group: Exclude<NavigationGroup, null>;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  variant: 'mobile' | 'sidebar';
}) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  const groupClass = variant === 'mobile' ? 'arena-mobile-menu-group' : 'arena-sidebar-nav-group';
  const groupItemsClass = variant === 'mobile' ? 'arena-mobile-menu-group-items' : 'arena-sidebar-nav-group-items';
  const groupTriggerClass = variant === 'mobile' ? 'arena-mobile-menu-group-trigger' : 'arena-sidebar-nav-group-trigger';
  const iconSize = variant === 'mobile' ? 18 : 19;
  const chevronSize = variant === 'mobile' ? 16 : 15;
  const groupId = `arena-${variant === 'mobile' ? 'mobile' : 'sidebar'}-${group}`;

  return (
    <div className={`${groupClass} ${group === 'misc' ? `${groupClass}--misc` : ''}`}>
      <button
        type="button"
        className={`${classPrefix}-link ${groupTriggerClass} ${active ? `${classPrefix}-link-active` : ''}`}
        aria-expanded={isOpen}
        aria-controls={groupId}
        onClick={onToggle}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          {group === 'constructors' ? <Grid3X3 size={iconSize} strokeWidth={1.8} /> : <Gift size={iconSize} strokeWidth={1.8} />}
        </span>
        <span className="arena-nav-group-copy">
          <span>{title}</span>
          <span className="arena-nav-group-caption">{caption}</span>
        </span>
        <ChevronDown size={chevronSize} className="arena-nav-group-chevron" />
      </button>
      <div id={groupId} className={groupItemsClass} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}

export type PublicNavigationProps = {
  activeTab: TabId;
  mobileMenuOpen: boolean;
  mobileNavGroup: NavigationGroup;
  sidebarNavGroup: NavigationGroup;
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
  onWarm: (tab: TabId | 'login') => void;
  onToggleMobileMenu: () => void;
  onCloseMobileMenu: () => void;
  onToggleMobileNavGroup: (group: Exclude<NavigationGroup, null>) => void;
  onToggleSidebarNavGroup: (group: Exclude<NavigationGroup, null>) => void;
};

function MobileTopbar({ mobileMenuOpen, mobileMenuToggleRef, onNavigate, onToggleMobileMenu }: PublicNavigationProps) {
  return (
    <header className="arena-mobile-topbar lg:hidden">
      <a href="/" onClick={event => { event.preventDefault(); onNavigate('home'); }} className="arena-mobile-brand" aria-label="HearthPulse — на главную">
        <img src="/hearthpulse-logo.webp" alt="" />
        <span>HearthPulse</span>
      </a>
      <button
        ref={mobileMenuToggleRef}
        type="button"
        onClick={onToggleMobileMenu}
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

function MobileMenu({
  activeTab, appIsContestAdmin, mobileMenuOpen, mobileMenuRef, mobileNavGroup, mobileProfile,
  onCloseMobileMenu, onNavigate, onNavigateLogin, onToggleMobileNavGroup, onWarm, profileLabel,
  visibleArenaTabs, visibleMiscTabs, wantsLogin,
}: PublicNavigationProps) {
  const mobileLinkProps = {
    activeTab,
    variant: 'mobile' as const,
    onNavigate,
    onWarm: (tab: TabId) => onWarm(tab),
  };
  const constructorsActive = BG_BUILDER_TABS.some(tab => tab.id === activeTab);
  const miscActive = visibleMiscTabs.some(tab => tab.id === activeTab);

  if (!mobileMenuOpen) return null;
  return (
    <>
      <button type="button" className="arena-mobile-drawer-backdrop lg:hidden" aria-label="Закрыть меню" onClick={onCloseMobileMenu} />
      <nav ref={mobileMenuRef} id="arena-mobile-menu" className="arena-mobile-menu lg:hidden" aria-label="Мобильная навигация">
        <NavigationRouteLinks routes={TOP_LEVEL_TABS} {...mobileLinkProps} />
        {appIsContestAdmin && <NavigationRouteLinks routes={ADMIN_TABS} {...mobileLinkProps} />}
        <NavigationSection title="Традиционный режим" caption="Мета и колоды" variant="mobile" />
        <NavigationRouteLinks routes={STANDARD_TABS} {...mobileLinkProps} />
        <NavigationSection title="Арена" caption="Драфт и выборы" variant="mobile" />
        <NavigationRouteLinks routes={visibleArenaTabs} {...mobileLinkProps} />
        <NavigationSection title="Поля Сражений" caption="Герои и тактика" variant="mobile" />
        <NavigationRouteLinks routes={BG_PRIMARY_TABS} {...mobileLinkProps} />
        <NavigationGroupControl active={constructorsActive} caption="Создавайте и сравнивайте" group="constructors" isOpen={mobileNavGroup === 'constructors'} onToggle={() => onToggleMobileNavGroup('constructors')} title="Конструкторы" variant="mobile">
          <NavigationRouteLinks routes={BG_BUILDER_TABS} {...mobileLinkProps} sublink onNavigate={tab => { onNavigate(tab); onCloseMobileMenu(); }} />
        </NavigationGroupControl>
        <NavigationGroupControl active={miscActive} caption="Материалы и события" group="misc" isOpen={mobileNavGroup === 'misc'} onToggle={() => onToggleMobileNavGroup('misc')} title="Разное" variant="mobile">
          <NavigationRouteLinks routes={visibleMiscTabs} {...mobileLinkProps} sublink onNavigate={tab => { onNavigate(tab); onCloseMobileMenu(); }} />
        </NavigationGroupControl>
        <a href="/?login" onPointerEnter={() => onWarm('login')} onFocus={() => onWarm('login')} onClick={event => { event.preventDefault(); onNavigateLogin(); }} className={`arena-mobile-menu-link arena-mobile-menu-profile ${wantsLogin ? 'arena-mobile-menu-link-active' : ''}`} aria-label={profileLabel}>
          {mobileProfile}
        </a>
      </nav>
    </>
  );
}

function DesktopSidebar({
  activeTab, appIsContestAdmin, onNavigate, onNavigateLogin, onToggleSidebarNavGroup, onWarm,
  profileLabel, sidebarNavGroup, sidebarProfile, updatedAtLabel, visibleArenaTabs, visibleMiscTabs,
  wantsLogin,
}: PublicNavigationProps) {
  const sidebarLinkProps = { activeTab, variant: 'sidebar' as const, onNavigate, onWarm: (tab: TabId) => onWarm(tab) };
  const constructorsActive = BG_BUILDER_TABS.some(tab => tab.id === activeTab);
  const miscActive = visibleMiscTabs.some(tab => tab.id === activeTab);
  return (
    <aside className="arena-sidebar" aria-label="Основная навигация">
          <a
            href="/"
            onClick={event => {
              event.preventDefault();
              onNavigate('home');
            }}
            className="arena-sidebar-brand"
            aria-label="HearthPulse — на главную"
          >
            <img className="arena-sidebar-brand-logo" src="/hearthpulse-logo.webp" alt="" />
            <span className="arena-sidebar-brand-copy">
              <strong>HearthPulse</strong>
            </span>
          </a>

          <nav className="arena-sidebar-nav" aria-label="Разделы сайта">
            <NavigationRouteLinks routes={TOP_LEVEL_TABS} {...sidebarLinkProps} />
            {appIsContestAdmin && <NavigationRouteLinks routes={ADMIN_TABS} {...sidebarLinkProps} />}
            <NavigationSection title="Традиционный режим" caption="Мета и колоды" variant="sidebar" />
            <NavigationRouteLinks routes={STANDARD_TABS} {...sidebarLinkProps} />
            <NavigationSection title="Арена" caption="Драфт и выборы" variant="sidebar" />
            <NavigationRouteLinks routes={visibleArenaTabs} {...sidebarLinkProps} />
            <NavigationSection title="Поля Сражений" caption="Герои и тактика" variant="sidebar" />
            <NavigationRouteLinks routes={BG_PRIMARY_TABS} {...sidebarLinkProps} />
            <NavigationGroupControl
              active={constructorsActive}
              caption="Создавайте и сравнивайте"
              group="constructors"
              isOpen={sidebarNavGroup === 'constructors'}
              onToggle={() => onToggleSidebarNavGroup('constructors')}
              title="Конструкторы"
              variant="sidebar"
            >
              <NavigationRouteLinks routes={BG_BUILDER_TABS} {...sidebarLinkProps} sublink />
            </NavigationGroupControl>
            <NavigationGroupControl
              active={miscActive}
              caption="Материалы и события"
              group="misc"
              isOpen={sidebarNavGroup === 'misc'}
              onToggle={() => onToggleSidebarNavGroup('misc')}
              title="Разное"
              variant="sidebar"
            >
              <NavigationRouteLinks routes={visibleMiscTabs} {...sidebarLinkProps} sublink />
            </NavigationGroupControl>
          </nav>

          <div className="arena-sidebar-status" aria-label="Дата обновления данных">
            <span>Обновлено</span>
            <strong>{updatedAtLabel}</strong>
          </div>

          <a
            href="/?login"
            onPointerEnter={() => onWarm('login')}
            onFocus={() => onWarm('login')}
            onClick={event => {
              event.preventDefault();
              onNavigateLogin();
            }}
            className={`arena-sidebar-profile ${wantsLogin ? 'arena-sidebar-profile-active' : ''}`}
            aria-label={profileLabel}
            style={{ textDecoration: 'none' }}
          >
            {sidebarProfile}
          </a>
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
