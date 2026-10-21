import type { ReactNode } from 'react';
import { ChevronDown, Gift, Grid3X3, type LucideIcon } from 'lucide-react';
import { canonicalPagePath } from '../routing/canonicalPagePath';
import type { TABS, TabId } from '../routing/navigationRoutes';

import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';

export type NavigationRoute = (typeof TABS)[number];
export type NavigationGroup = 'constructors' | 'misc';
/** A short honest marker next to a menu item, e.g. «Новый» for a patch published since the last visit. */
export type NavigationBadges = Partial<Record<TabId, { label: string; title: string }>>;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  sublink?: boolean;
  /** Section name the compact rail's tooltip adds, so the two «Тир-лист» items stay distinguishable. */
  context?: string;
  badges?: NavigationBadges;
  onNavigate: (tab: TabId) => void;
};

export function NavigationRouteLinks({
  routes,
  activeTab,
  variant,
  sublink = false,
  context,
  badges,
  onNavigate,
}: NavigationRouteLinksProps) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  const iconSize = sublink ? 17 : variant === 'mobile' ? 19 : 18;
  return routes.map(tab => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    const badge = badges?.[tab.id];
    return (
      <a
        key={tab.id}
        href={canonicalPagePath(tab.path)}
        onClick={event => {
          if (!isPlainNavigationClick(event)) return;
          event.preventDefault();
          onNavigate(tab.id);
        }}
        aria-current={active ? 'page' : undefined}
        data-nav-link=""
        data-nav-tip={context ? `${tab.label} · ${context}` : tab.label}
        className={`${classPrefix}-link ${sublink ? `${classPrefix}-sublink ` : ''}${active ? `${classPrefix}-link-active` : ''}`}
        style={variant === 'sidebar' ? { textDecoration: 'none' } : undefined}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          <Icon size={iconSize} strokeWidth={1.8} />
        </span>
        <span className="arena-nav-label">{tab.label}</span>
        {badge && <span className="arena-nav-badge" title={badge.title}>{badge.label}</span>}
      </a>
    );
  });
}

export function NavigationSection({
  title,
  icon: Icon,
  variant,
}: {
  title: string;
  icon: LucideIcon;
  variant: 'mobile' | 'sidebar';
}) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  return (
    <div className={`${classPrefix}-section`}>
      <span className="arena-nav-section-icon" aria-hidden="true"><Icon size={14} strokeWidth={2} /></span>
      <span className={`${classPrefix}-section-title`}>{title}</span>
    </div>
  );
}

export function NavigationGroupControl({
  active,
  children,
  group,
  isOpen,
  onToggle,
  title,
  variant,
}: {
  active: boolean;
  children: ReactNode;
  group: NavigationGroup;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  variant: 'mobile' | 'sidebar';
}) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  const groupClass = variant === 'mobile' ? 'arena-mobile-menu-group' : 'arena-sidebar-nav-group';
  const groupItemsClass = variant === 'mobile' ? 'arena-mobile-menu-group-items' : 'arena-sidebar-nav-group-items';
  const groupTriggerClass = variant === 'mobile' ? 'arena-mobile-menu-group-trigger' : 'arena-sidebar-nav-group-trigger';
  const iconSize = variant === 'mobile' ? 19 : 18;
  const chevronSize = variant === 'mobile' ? 16 : 15;
  const groupId = `arena-${variant === 'mobile' ? 'mobile' : 'sidebar'}-${group}`;

  return (
    <div className={`${groupClass} ${group === 'misc' ? `${groupClass}--misc` : ''}`}>
      <button
        type="button"
        className={`${classPrefix}-link ${groupTriggerClass} ${active ? `${classPrefix}-link-active` : ''}`}
        aria-expanded={isOpen}
        aria-controls={groupId}
        data-nav-tip={title}
        onClick={onToggle}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          {group === 'constructors' ? <Grid3X3 size={iconSize} strokeWidth={1.8} /> : <Gift size={iconSize} strokeWidth={1.8} />}
        </span>
        <span className="arena-nav-label">{title}</span>
        <ChevronDown size={chevronSize} className="arena-nav-group-chevron" />
      </button>
      <div id={groupId} className={groupItemsClass} hidden={!isOpen}>
        {children}
      </div>
    </div>
  );
}
