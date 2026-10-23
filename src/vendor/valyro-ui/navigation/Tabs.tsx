'use client';

import { useEffect, useRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { animateSpring, cx } from '../primitives';
import { collectionPart, partsOf } from '../primitives/compound';
import { Badge } from '../basic/Badge';
import { revealInList, useOverflowScroll, useSlidingIndicator } from './internal';
import { useTabs } from './useTabs';
import '../primitives/motion.css';
import './Tabs.css';
import { withRef, useLayoutEffect } from '../primitives/react-compat';

/** CSS transitions height to and from `auto` (interpolate-size): a spring tab switch eases the panel area in CSS. */
const cssHeights = typeof CSS !== 'undefined' && CSS.supports?.('interpolate-size', 'allow-keywords') === true;

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Count or short text shown after the label. */
  badge?: ReactNode;
  disabled?: boolean;
  /** Panel content. Tabs without content act as a plain switcher (no tabpanel). */
  content?: ReactNode;
}

export interface TabsProps extends Omit<ComponentPropsWithRef<'div'>, 'defaultValue' | 'onChange' | 'children'> {
  /** Tabs in order, each with optional panel content. Or compose them as children: `Tabs.List`, `Tabs.Tab`, `Tabs.Panel`. */
  items?: TabItem[];
  /** The compound form instead of `items`: a `Tabs.List` of `Tabs.Tab`s, then a `Tabs.Panel` per tab that has content. */
  children?: ReactNode;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `underline`: a bar slides along the baseline; `pills`: a filled shape slides behind the active tab. */
  variant?: 'underline' | 'pills';
  /** Accessible name of the tab list. */
  label?: string;
  /**
   * `spring`: the indicator springs between tabs, the new panel slides in from the side of the tab it
   * came from and the panel area eases to the new height. `default`: the theme's indicator, instant panels.
   */
  animation?: 'default' | 'spring';
  /**
   * `automatic` (default): moving focus with the arrow keys selects the tab. `manual`: the arrows only move
   * focus and Enter or Space selects, for panels that are slow to render or load (WAI-ARIA APG, React Aria).
   */
  keyboardActivation?: 'automatic' | 'manual';
  /** `vertical`: the tabs stack in a column beside the panel and move with ArrowUp / ArrowDown. */
  orientation?: 'horizontal' | 'vertical';
}

export interface TabsListProps {
  /** Accessible name of the tab list (the `label` of Tabs). */
  label?: string;
  /** The `Tabs.Tab` elements. */
  children?: ReactNode;
}

export interface TabsTabProps extends Omit<TabItem, 'label' | 'content'> {
  /** The tab's label. */
  children?: ReactNode;
}

export interface TabsPanelProps {
  /** Value of the tab the panel belongs to. */
  value: string;
  /** Panel content. */
  children?: ReactNode;
}

/** The row of tabs in the compound form. */
export const TabsList = collectionPart<TabsListProps>('Tabs.List');
/** One tab of a `Tabs.List`: the props of a TabItem, with the label as children. */
export const TabsTab = collectionPart<TabsTabProps>('Tabs.Tab');
/** The content of the tab with the same `value`. */
export const TabsPanel = collectionPart<TabsPanelProps>('Tabs.Panel');

/** TabItems from the compound children: tabs from the list, content from the panel with the same value. */
function tabsFromParts(children: ReactNode): { items: TabItem[]; label?: string } {
  const list = partsOf<TabsListProps>(children, TabsList)[0];
  const panels = new Map(partsOf<TabsPanelProps>(children, TabsPanel).map(({ props }) => [props.value, props.children ?? null]));
  const tabs = partsOf<TabsTabProps>(list ? list.props.children : children, TabsTab);
  const items = tabs.map(({ props: { children: label, ...tab } }) => ({ ...tab, label, content: panels.get(tab.value) }));
  return { items, label: list?.props.label };
}

export const Tabs = withRef(function Tabs({
  items: itemsProp,
  children,
  value,
  defaultValue,
  onValueChange,
  variant = 'underline',
  label,
  animation = 'default',
  keyboardActivation = 'automatic',
  orientation = 'horizontal',
  className,
  ...rest
}: TabsProps) {
  const parts = itemsProp ? undefined : tabsFromParts(children);
  const items = itemsProp ?? parts?.items ?? [];
  const listLabel = label ?? parts?.label;
  // The behaviour is useTabs's (valyro-ui/headless): selection, ids, the roving tab stop and the keys.
  const tabs = useTabs({
    tabs: items.map((item) => ({ value: item.value, disabled: item.disabled, panel: item.content !== undefined })),
    value,
    defaultValue,
    onValueChange,
    orientation,
    activation: keyboardActivation,
  });
  const current = tabs.value;
  const listRef = useRef<HTMLDivElement>(null);
  const indicator = useSlidingIndicator(listRef, current);
  // Scrolls only while the tabs are too wide, so a row that fits never clips focus rings or touch targets.
  useOverflowScroll(listRef, items.length, ':scope > [data-active="true"]');

  // Keeps the selected tab visible when the value changes from outside (or starts) past the scroll edge.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>(':scope > [data-active="true"]');
    if (list && tab) revealInList(list, tab);
  }, [current]);

  const selectedIndex = items.findIndex((item) => item.value === current);
  const spring = animation === 'spring';
  const vertical = orientation === 'vertical';
  const panelsRef = useRef<HTMLDivElement>(null);
  const shown = useRef({ index: selectedIndex, height: 0 });

  // Spring: remember the panel area's height as it changes (content loading, resizing), so a switch can
  // ease from the height that was really on screen.
  useEffect(() => {
    const panels = panelsRef.current;
    if (!spring || !panels || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!panels.getAnimations().length) shown.current.height = panels.offsetHeight;
    });
    observer.observe(panels);
    return () => observer.disconnect();
  }, [spring]);

  // Spring: the new panel slides in from the side of the previous tab — CSS keyframes that start as it is shown,
  // data-from on the area names the side (Tabs.css) — while the area eases to its height. The height changes
  // from auto to auto, which no CSS transition starts by itself: where CSS transitions to auto (interpolate-size)
  // the area is held at the height on screen for one style pass and let go, and a CSS transition carries it to
  // the new auto height (data-animating); elsewhere a Web Animation runs between the measured heights.
  useLayoutEffect(() => {
    const panels = panelsRef.current;
    const previous = shown.current;
    const switched = spring && panels && previous.index >= 0 && previous.index !== selectedIndex && selectedIndex >= 0;
    if (switched) panels.setAttribute('data-from', selectedIndex > previous.index ? 'end' : 'start');
    // A switch mid-way through the last one starts from the height on screen, before that transition stops.
    const moving = switched && cssHeights && panels.getAnimations().some((running) => (running as CSSTransition).transitionProperty === 'height');
    const from = moving ? panels.offsetHeight : previous.height;
    if (switched && cssHeights) panels.removeAttribute('data-animating');
    shown.current = { index: selectedIndex, height: panels?.offsetHeight ?? 0 };
    if (!switched) return;
    const height = panels.offsetHeight;
    if (!from || from === height) return;
    if (cssHeights) {
      panels.style.height = `${from}px`;
      void panels.offsetHeight;
      panels.style.removeProperty('height');
      panels.setAttribute('data-animating', '');
      return;
    }
    panels.setAttribute('data-animating', '');
    const growth = animateSpring(panels, { height: [`${from}px`, `${height}px`] }, 'smooth');
    const done = () => panels.removeAttribute('data-animating');
    if (growth) growth.onfinish = growth.oncancel = done;
    else done();
  }, [selectedIndex, spring]);

  // The CSS height transition is over: the area stops clipping.
  useEffect(() => {
    const panels = panelsRef.current;
    if (!spring || !panels || !cssHeights) return;
    const done = (event: TransitionEvent) => {
      if (event.target === panels && event.propertyName === 'height') panels.removeAttribute('data-animating');
    };
    panels.addEventListener('transitionend', done);
    panels.addEventListener('transitioncancel', done);
    return () => {
      panels.removeEventListener('transitionend', done);
      panels.removeEventListener('transitioncancel', done);
    };
  }, [spring]);
  return (
    <div
      {...rest}
      className={cx('ui-tabs', className)}
      data-variant={variant}
      data-orientation={vertical ? 'vertical' : undefined}
      data-motion={spring ? 'spring' : undefined}
    >
      <div {...tabs.getListProps({ ref: listRef, 'aria-label': listLabel, className: 'ui-tabs__list' })}>
        {items.map((item, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={item.value}
              {...tabs.getTabProps(
                { value: item.value, disabled: item.disabled, panel: item.content !== undefined },
                { 'data-active': selected || undefined, className: 'ui-tabs__tab' },
              )}
            >
              {item.icon && <span className="ui-tabs__icon">{item.icon}</span>}
              <span className="ui-tabs__label">{item.label}</span>
              {item.badge != null && (
                <Badge size="sm" className="ui-tabs__badge">
                  {item.badge}
                </Badge>
              )}
            </button>
          );
        })}
        {indicator && (
          <span
            className="ui-tabs__indicator"
            aria-hidden="true"
            style={
              vertical
                ? { height: indicator.height, transform: `translateY(${indicator.top}px)`, transition: indicator.instant ? 'none' : undefined }
                : { width: indicator.width, transform: `translateX(${indicator.left}px)`, transition: indicator.instant ? 'none' : undefined }
            }
          />
        )}
      </div>
      {spring ? (
        <div ref={panelsRef} className="ui-tabs__panels">
          {renderPanels()}
        </div>
      ) : (
        renderPanels()
      )}
    </div>
  );

  function renderPanels() {
    return items.map(
      (item) =>
        item.content !== undefined && (
          <div key={item.value} {...tabs.getPanelProps(item.value, { className: 'ui-tabs__panel' })}>
            {item.content}
          </div>
        ),
    );
  }
}, { List: TabsList, Tab: TabsTab, Panel: TabsPanel });
