'use client';

import { useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type KeyboardEvent } from 'react';
import { useControllableState } from '../primitives/useControllableState';
import { stepIndex } from '../primitives/useListNavigation';
import { getDirection, inlineArrowStep } from '../primitives/utils';
import { getTabbables } from '../primitives/useFocusTrap';
import { useId, useLayoutEffect } from '../primitives/react-compat';
import { partId, withUserProps, type UserProps } from '../primitives/prop-getters';

/*
 * The behaviour of Tabs without its markup: the selected tab (controlled or not), the ids that tie a tab to its
 * panel, a roving tab stop (Tab reaches the selected tab, or the first enabled one) and the WAI-ARIA keys: ←/→
 * (mirrored under RTL) or ↑/↓ with `orientation: 'vertical'`, Home and End, skipping disabled tabs. With
 * `activation: 'automatic'` (default) focusing a tab selects it; with `manual`, Enter, Space or a click does.
 * Tabs renders with it.
 */

export interface TabsOptions {
  /** The tabs in order: their values, and which are disabled. */
  tabs: TabsTabDescriptor[];
  /** Value of the selected tab. Default: the first enabled tab. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Which arrows move between tabs. Default `horizontal`. */
  orientation?: 'horizontal' | 'vertical';
  /** `automatic`: an arrow selects the tab it moves to. `manual`: it only moves focus. Default `automatic`. */
  activation?: 'automatic' | 'manual';
}

/** A tab, as the getters see it. */
export interface TabsTabDescriptor {
  value: string;
  disabled?: boolean;
  /** false for a tab without a panel (a plain switcher): it then points at none. Default true. */
  panel?: boolean;
}

type TabState = { 'data-state': 'active' | 'inactive' };

export interface TabsState {
  value: string;
  setValue: (value: string) => void;
  isSelected: (value: string) => boolean;
  /** The `role="tablist"` element: the arrow keys, Home and End. Name it with `aria-label`. */
  getListProps: (props?: UserProps) => HTMLAttributes<HTMLElement> & { 'data-orientation': 'horizontal' | 'vertical' };
  /** A tab's `<button>`. */
  getTabProps: (tab: TabsTabDescriptor, props?: UserProps) => ButtonHTMLAttributes<HTMLButtonElement> & TabState & {
    ref: (node: HTMLButtonElement | null) => void;
  };
  /** The panel of the tab with `value`: named by its tab, hidden while another tab is selected; a Tab stop only while nothing inside it is. */
  getPanelProps: (value: string, props?: UserProps) => HTMLAttributes<HTMLElement> & TabState;
  /** Id of the tab with `value`. */
  getTabId: (value: string) => string;
  /** Id of the panel of the tab with `value`. */
  getPanelId: (value: string) => string;
}

export function useTabs({
  tabs,
  value: valueProp,
  defaultValue,
  onValueChange,
  orientation = 'horizontal',
  activation = 'automatic',
}: TabsOptions): TabsState {
  const [value, setValue] = useControllableState({
    value: valueProp,
    defaultValue: defaultValue ?? tabs.find((tab) => !tab.disabled)?.value ?? '',
    onChange: onValueChange,
  });
  const baseId = useId();
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  // One ref callback per tab, so a tab's ref does not change on every render.
  const refs = useRef(new Map<string, (node: HTMLButtonElement | null) => void>());
  const tabRef = (tabValue: string) => {
    let ref = refs.current.get(tabValue);
    if (!ref) {
      ref = (node) => {
        if (node) nodes.current.set(tabValue, node);
        else nodes.current.delete(tabValue);
      };
      refs.current.set(tabValue, ref);
    }
    return ref;
  };

  const getTabId = (tabValue: string) => partId(baseId, 'tab', tabValue);
  const getPanelId = (tabValue: string) => partId(baseId, 'panel', tabValue);
  const isDisabled = (index: number) => !!tabs[index]?.disabled;
  const selectedIndex = tabs.findIndex((tab) => tab.value === value);
  // Keep the list reachable by Tab even when the value matches no tab or a disabled one.
  const focusableIndex = selectedIndex >= 0 && !isDisabled(selectedIndex) ? selectedIndex : tabs.findIndex((tab) => !tab.disabled);

  // The shown panel is a Tab stop only while nothing inside it is (WAI-ARIA APG, React Aria's useTabPanel): a panel
  // that starts with a link or a field would otherwise cost an extra Tab. Rechecked when its content changes.
  const [panelHasTabbable, setPanelHasTabbable] = useState(false);
  useLayoutEffect(() => {
    const panel = document.getElementById(getPanelId(value));
    if (!panel) return;
    const check = () => setPanelHasTabbable(getTabbables(panel).length > 0);
    check();
    if (typeof MutationObserver === 'undefined') return;
    const observer = new MutationObserver(check);
    observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['tabindex', 'disabled', 'hidden'] });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- panel ids derive from the value and a stable base id
  }, [value]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const node = event.target as HTMLButtonElement;
    const from = tabs.findIndex((tab) => nodes.current.get(tab.value) === node);
    if (from < 0) return;
    const count = tabs.length;
    let step: 1 | -1 | 0 = 0;
    if (orientation === 'vertical') step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    else step = inlineArrowStep(event.key, getDirection(event.currentTarget as Element)) ?? 0;
    const next =
      step !== 0
        ? stepIndex(count, from, step, isDisabled)
        : event.key === 'Home'
          ? stepIndex(count, -1, 1, isDisabled)
          : event.key === 'End'
            ? stepIndex(count, count, -1, isDisabled)
            : -1;
    if (next < 0) return;
    event.preventDefault();
    nodes.current.get(tabs[next].value)?.focus();
    if (activation === 'automatic') setValue(tabs[next].value);
  };

  return {
    value,
    setValue,
    isSelected: (tabValue) => tabValue === value,
    getListProps: (props) =>
      withUserProps({ role: 'tablist', 'aria-orientation': orientation, 'data-orientation': orientation, onKeyDown }, props) as never,
    getTabProps: (tab, props) => {
      const index = tabs.findIndex((t) => t.value === tab.value);
      const selected = tab.value === value;
      return withUserProps(
        {
          ref: tabRef(tab.value),
          type: 'button',
          role: 'tab',
          id: getTabId(tab.value),
          'aria-selected': selected,
          'aria-controls': tab.panel === false ? undefined : getPanelId(tab.value),
          tabIndex: index === focusableIndex ? 0 : -1,
          disabled: tab.disabled,
          'data-state': selected ? 'active' : 'inactive',
          onClick: () => setValue(tab.value),
        },
        props,
      ) as never;
    },
    getPanelProps: (tabValue, props) => {
      const selected = tabValue === value;
      return withUserProps(
        {
          role: 'tabpanel',
          id: getPanelId(tabValue),
          'aria-labelledby': getTabId(tabValue),
          hidden: !selected,
          tabIndex: selected && panelHasTabbable ? undefined : 0,
          'data-state': selected ? 'active' : 'inactive',
        },
        props,
      ) as never;
    },
    getTabId,
    getPanelId,
  };
}
