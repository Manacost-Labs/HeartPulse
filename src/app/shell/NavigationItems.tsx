import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { canonicalPagePath } from '../routing/canonicalPagePath';
import type { TABS, TabId } from '../routing/navigationRoutes';

import { isPlainNavigationClick } from '../routing/isPlainNavigationClick';

export type NavigationRoute = (typeof TABS)[number];
export type NavigationGroup = 'standard' | 'arena' | 'battlegrounds' | 'community';

/** Every icon of the menu shares one size and one stroke, so no item outweighs another. */
export const NAV_ICON_SIZE = 18;
export const NAV_ICON_STROKE = 1.75;
/** A short honest marker next to a menu item, e.g. «Новый» for a patch published since the last visit. */
export type NavigationBadges = Partial<Record<TabId, { label: string; title: string }>>;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  /** Section name the compact rail's tooltip adds, so the two «Тир-лист» items stay distinguishable. */
  context?: string;
  badges?: NavigationBadges;
  onNavigate: (tab: TabId) => void;
};

export function NavigationRouteLinks({
  routes,
  activeTab,
  variant,
  context,
  badges,
  onNavigate,
}: NavigationRouteLinksProps) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
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
        className={`${classPrefix}-link ${active ? `${classPrefix}-link-active` : ''}`}
        style={variant === 'sidebar' ? { textDecoration: 'none' } : undefined}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          <Icon size={NAV_ICON_SIZE} strokeWidth={NAV_ICON_STROKE} />
        </span>
        <span className="arena-nav-label">{tab.label}</span>
        {badge && <span className="arena-nav-badge" title={badge.title}>{badge.label}</span>}
      </a>
    );
  });
}

/** A collapsible mode of the menu: the title is the button, its links stay in the server HTML while it is closed (`data-closed`, not `hidden`: Tailwind's preflight makes `[hidden]` unoverridable, and the compact rail must show every item). */
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
  const groupId = `arena-${variant}-${group}`;
  return (
    <div className={`${classPrefix}-group`}>
      <button
        type="button"
        className={`${classPrefix}-group-trigger`}
        aria-expanded={isOpen}
        aria-controls={groupId}
        data-current={active ? '' : undefined}
        onClick={onToggle}
      >
        <span className="arena-nav-label">{title}</span>
        <ChevronDown size={NAV_ICON_SIZE - 2} strokeWidth={NAV_ICON_STROKE} aria-hidden="true" className="arena-nav-group-chevron" />
      </button>
      <div id={groupId} className={`${classPrefix}-group-items`} data-closed={isOpen ? undefined : ''}>
        {children}
      </div>
    </div>
  );
}
