'use client';

import { useRef, useState, type ComponentPropsWithRef, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ChevronDownIcon } from '../icons';
import { cx, mergeRefs, Slot, useControllableState, useDirection } from '../primitives';
import { Badge } from '../basic/Badge';
import { Tooltip } from '../basic/Tooltip';
import { DropdownMenu } from './DropdownMenu';
import { useVerticalScrollEdges } from './internal';
import type { MenuItem } from './Menu';
import './Sidebar.css';
import { withRef, useId, useLayoutEffect, inertAttr } from '../primitives/react-compat';

export interface SidebarItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Count or short status after the label; a dot in collapsed mode. */
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Child items, shown as a collapsible group. */
  items?: SidebarItem[];
  /** Group starts expanded (groups containing the active item always do). */
  defaultOpen?: boolean;
}

export interface SidebarSection {
  label?: string;
  items: SidebarItem[];
}

export interface SidebarProps extends Omit<ComponentPropsWithRef<'aside'>, 'defaultValue' | 'onChange'> {
  /** Groups of nav items, each with an optional heading (a divider in collapsed mode). */
  sections: SidebarSection[];
  /** Id of the active item. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  /** Icons-only rail; labels move into tooltips and groups into flyout menus. */
  collapsed?: boolean;
  /** Fixed slot above the navigation, e.g. a logo or workspace switcher. */
  header?: ReactNode;
  /** Fixed slot below the navigation, e.g. the user menu. */
  footer?: ReactNode;
  /** Accessible name of the navigation. */
  label?: string;
}

/** The rail hides badges behind a dot, so a plain-text badge joins the accessible name. */
const railLabel = (item: SidebarItem) =>
  typeof item.badge === 'string' || typeof item.badge === 'number' ? `${item.label} (${item.badge})` : item.label;

const TOOLTIP_DELAY = 150;

const contains = (item: SidebarItem, id: string | undefined): boolean =>
  !!item.items?.some((child) => child.id === id || contains(child, id));

/** Ids of the groups to expand: those containing `activeId`, plus `defaultOpen` ones when `withDefaults`. */
function groupsToOpen(sections: SidebarSection[], activeId: string | undefined, withDefaults: boolean) {
  const open = new Set<string>();
  const visit = (items: SidebarItem[]) => {
    for (const item of items) {
      if (!item.items) continue;
      if ((withDefaults && item.defaultOpen) || contains(item, activeId)) open.add(item.id);
      visit(item.items);
    }
  };
  sections.forEach((section) => visit(section.items));
  return open;
}

export const Sidebar = withRef(function Sidebar({
  sections,
  value,
  defaultValue,
  onValueChange,
  collapsed = false,
  header,
  footer,
  label = 'Sidebar',
  className,
  ref,
  ...rest
}: SidebarProps) {
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // Fades the nav's scrolled-past edges (Sidebar.css); re-measured when the rail toggles or the sections change.
  useVerticalScrollEdges(navRef, `${collapsed}:${sections.length}`);
  // Tooltips and flyouts open away from the sidebar, towards the content: right in LTR, left in RTL.
  const outward = useDirection(asideRef) === 'rtl' ? 'left' : 'right';
  const [active, setActive] = useControllableState<string | undefined>({
    value,
    defaultValue,
    onChange: (id) => id !== undefined && onValueChange?.(id),
  });
  const [openGroups, setOpenGroups] = useState(() => groupsToOpen(sections, active, true));
  const baseId = useId();
  useActiveIndicator(navRef, active, collapsed);

  // A value set from outside (e.g. by the router) must not leave the active item inside a collapsed group.
  const [revealed, setRevealed] = useState(active);
  if (revealed !== active) {
    setRevealed(active);
    const needed = [...groupsToOpen(sections, active, false)].filter((id) => !openGroups.has(id));
    if (needed.length > 0) setOpenGroups((prev) => new Set([...prev, ...needed]));
  }

  const select = (item: SidebarItem) => {
    if (item.disabled) return;
    setActive(item.id);
    item.onClick?.();
  };

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toMenuItems = (items: SidebarItem[]): MenuItem[] =>
    items.map((item) => ({
      label: item.label,
      icon: item.icon,
      href: item.href,
      disabled: item.disabled,
      onSelect: item.items ? undefined : () => select(item),
      items: item.items ? toMenuItems(item.items) : undefined,
    }));

  const renderIcon = (item: SidebarItem) =>
    item.icon ? (
      <span className="ui-sidebar__icon">{item.icon}</span>
    ) : (
      // The rail needs something to show for icon-less items.
      collapsed && (
        <span className="ui-sidebar__icon ui-sidebar__initial" aria-hidden="true">
          {item.label.charAt(0)}
        </span>
      )
    );

  const renderItem = (item: SidebarItem): ReactNode => {
    const isActive = item.id === active;
    const hasActiveChild = contains(item, active);
    const badge =
      item.badge == null ? null : collapsed ? (
        <span className="ui-sidebar__dot" aria-hidden="true" />
      ) : (
        <Badge size="sm" className="ui-sidebar__badge">
          {item.badge}
        </Badge>
      );

    if (item.items) {
      if (collapsed) {
        return (
          <li key={item.id}>
            <RailFlyout
              side={outward}
              label={item.label}
              items={[{ type: 'label', label: item.label }, ...toMenuItems(item.items)]}
            >
              <button
                type="button"
                className="ui-sidebar__item"
                aria-label={railLabel(item)}
                data-active={hasActiveChild || undefined}
                disabled={item.disabled}
              >
                {renderIcon(item)}
                {badge}
              </button>
            </RailFlyout>
          </li>
        );
      }
      const open = openGroups.has(item.id);
      const groupId = `${baseId}-${item.id}`;
      return (
        <li key={item.id}>
          <button
            type="button"
            className="ui-sidebar__item"
            aria-expanded={open}
            aria-controls={groupId}
            data-group=""
            data-has-active={hasActiveChild || undefined}
            disabled={item.disabled}
            onClick={() => toggleGroup(item.id)}
          >
            {renderIcon(item)}
            <span className="ui-sidebar__label">{item.label}</span>
            {badge}
            <ChevronDownIcon className="ui-sidebar__chevron" size={14} />
          </button>
          {/* Folds open on a 0fr → 1fr grid row; closed it stays mounted but inert (no focus, hidden from AT). */}
          <div className="ui-sidebar__group" data-state={open ? 'open' : 'closed'} inert={inertAttr(!open)}>
            <ul id={groupId} className="ui-sidebar__list ui-sidebar__sublist">
              {item.items.map((child) => renderItem(child))}
            </ul>
          </div>
        </li>
      );
    }

    const props = {
      className: 'ui-sidebar__item',
      'aria-current': isActive ? ('page' as const) : undefined,
      'aria-label': collapsed ? railLabel(item) : undefined,
      'data-active': isActive || undefined,
      onClick: () => select(item),
    };
    const content = (
      <>
        {renderIcon(item)}
        {!collapsed && <span className="ui-sidebar__label">{item.label}</span>}
        {badge}
      </>
    );
    const element =
      item.href && !item.disabled ? (
        <a href={item.href} {...props}>
          {content}
        </a>
      ) : (
        <button type="button" disabled={item.disabled} {...props}>
          {content}
        </button>
      );

    return (
      <li key={item.id}>
        {collapsed ? (
          <Tooltip content={item.label} placement={outward} delay={TOOLTIP_DELAY}>
            {element}
          </Tooltip>
        ) : (
          element
        )}
      </li>
    );
  };

  return (
    <aside
      {...rest}
      ref={mergeRefs(asideRef, ref)}
      className={cx('ui-sidebar', className)}
      data-collapsed={collapsed || undefined}
    >
      {header && <div className="ui-sidebar__header">{header}</div>}
      <nav ref={navRef} aria-label={label} className="ui-sidebar__nav">
        <span className="ui-sidebar__indicator" aria-hidden="true" />
        {sections.map((section, index) => (
          <div key={section.label ?? index} className="ui-sidebar__section">
            {section.label &&
              (collapsed ? (
                <div className="ui-sidebar__divider" role="presentation" />
              ) : (
                <div className="ui-sidebar__section-label">{section.label}</div>
              ))}
            <ul className="ui-sidebar__list" aria-label={section.label}>
              {section.items.map((item) => renderItem(item))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="ui-sidebar__footer">{footer}</div>}
    </aside>
  );
});

/**
 * One active-row fill that glides to the newly chosen row (Linear-style). Written straight to the DOM:
 * rows that move under it (a group folding above, a resize) are followed every frame without
 * re-rendering, without a transition. Until it is placed (SSR, first paint), or while the active row is
 * out of sight (a folded group, a rail flyout), the row paints its own fill.
 */
function useActiveIndicator(navRef: RefObject<HTMLElement | null>, active: string | undefined, collapsed: boolean) {
  const changedAt = useRef(-Infinity);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = nav?.querySelector<HTMLElement>(':scope > .ui-sidebar__indicator');
    if (!nav || !indicator) return;
    if (mounted.current) changedAt.current = performance.now();
    mounted.current = true;
    const place = (glide: boolean) => {
      const row = nav.querySelector<HTMLElement>('.ui-sidebar__item[data-active]');
      const shown = !!row && row.offsetParent !== null && !row.closest('[inert]');
      if (!row || !shown) {
        delete nav.dataset.indicator;
        return;
      }
      const n = nav.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      const x = r.left - n.left - nav.clientLeft + nav.scrollLeft;
      const y = r.top - n.top - nav.clientTop + nav.scrollTop;
      // A first placement, or a row that moved by itself, jumps; a newly chosen row glides.
      indicator.style.transition = glide && nav.dataset.indicator !== undefined ? '' : 'none';
      indicator.style.width = `${r.width}px`;
      indicator.style.height = `${r.height}px`;
      indicator.style.transform = `translate(${x}px, ${y}px)`;
      nav.dataset.indicator = '';
    };
    place(true);
    const follow = () => place(performance.now() - changedAt.current < 60);
    const observer = new ResizeObserver(follow);
    const observeLists = () => {
      observer.observe(nav);
      for (const list of nav.querySelectorAll('.ui-sidebar__list, .ui-sidebar__group')) observer.observe(list);
    };
    observeLists();
    // New sections (a filter, a language switch) mount new rows and lists without resizing the nav:
    // watch them too and move the fill to wherever the active row is now.
    const mutations = new MutationObserver(() => {
      observeLists();
      follow();
    });
    mutations.observe(nav, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [navRef, active, collapsed]);
}

interface RailFlyoutProps {
  side: 'left' | 'right';
  label: string;
  items: MenuItem[];
  children: ReactElement;
}

/**
 * A rail group: tooltip on hover/focus, flyout menu on click. Tooltip and
 * DropdownMenu both inject props into their child, so an inner Slot carries the
 * tooltip's props onto the menu trigger and both reach the same button.
 */
function RailFlyout({ side, label, items, children }: RailFlyoutProps) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip content={label} placement={side} delay={TOOLTIP_DELAY} disabled={open}>
      <TooltipToMenu side={side} menuOpen={open} onMenuOpenChange={setOpen} items={items}>
        {children}
      </TooltipToMenu>
    </Tooltip>
  );
}

interface TooltipToMenuProps {
  side: 'left' | 'right';
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  items: MenuItem[];
  children: ReactElement;
}

// Tooltip injects its trigger props, a ref among them, which withRef forwards on React 17/18.
const TooltipToMenu = withRef(function TooltipToMenu({ side, menuOpen, onMenuOpenChange, items, children, ...tooltipProps }: TooltipToMenuProps) {
  return (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={onMenuOpenChange}
      placement={`${side}-start`}
      items={items}
      trigger={<Slot {...tooltipProps}>{children}</Slot>}
    />
  );
});
