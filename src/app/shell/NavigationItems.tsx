import type { ReactNode } from 'react';
import { ChevronDown, Gift, Grid3X3 } from 'lucide-react';
import type { TABS, TabId } from '../routing/navigationRoutes';

export type NavigationRoute = (typeof TABS)[number];
export type NavigationGroup = 'constructors' | 'misc' | null;

type NavigationRouteLinksProps = {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  sublink?: boolean;
  onNavigate: (tab: TabId) => void;
  onWarm: (tab: TabId) => void;
};

export function NavigationRouteLinks({
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

export function NavigationSection({
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

export function NavigationGroupControl({
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

