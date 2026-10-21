'use client';

import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef, type ReactNode, type RefObject } from 'react';
import { ChevronRightIcon, MoreHorizontalIcon } from '../icons';
import { cx, mergeRefs } from '../primitives';
import { Tooltip } from '../basic/Tooltip';
import { DropdownMenu } from './DropdownMenu';
import { useOverflowScroll } from './internal';
import './Breadcrumbs.css';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export interface BreadcrumbsProps extends Omit<ComponentPropsWithRef<'nav'>, 'children'> {
  /** Path from the root; the last item is the current page. */
  items: BreadcrumbItem[];
  /** Content between items, hidden from assistive tech. */
  separator?: ReactNode;
  /** Collapse the middle into an ellipsis menu when there are more items (minimum 2). */
  maxItems?: number;
  /** Accessible name of the ellipsis button; receives the number of hidden items. */
  ellipsisLabel?: (hiddenCount: number) => string;
}

const defaultEllipsisLabel = (count: number) => `Show ${count} hidden ${count === 1 ? 'level' : 'levels'}`;

export function Breadcrumbs({
  items,
  separator = <ChevronRightIcon size={14} />,
  maxItems,
  ellipsisLabel = defaultEllipsisLabel,
  className,
  ref,
  'aria-label': ariaLabel,
  ...rest
}: BreadcrumbsProps) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // Crumbs shown before any folding for width; folding keeps at least the root and the current page.
  const shown = Math.min(items.length, maxItems === undefined ? items.length : Math.max(2, maxItems));
  const fold = useAutoFold(navRef, listRef, `${items.map((item) => item.label).join('\u0000')}\u0001${shown}`, Math.max(0, shown - 2));
  const limit = shown - fold;
  // Keeps the root plus the last (limit - 1) items; everything between goes into the menu.
  const hidden = items.length > limit ? items.slice(1, items.length - (limit - 1)) : [];
  const visible: (BreadcrumbItem | 'ellipsis')[] =
    hidden.length > 0 ? [items[0], 'ellipsis', ...items.slice(items.length - (limit - 1))] : items;
  // Last resort, once nothing is left to fold: the path scrolls sideways, kept scrolled to the current page.
  useOverflowScroll(
    listRef,
    visible.map((item) => (item === 'ellipsis' ? '…' : item.label)).join('\u0000'),
    ':scope > :last-child',
  );

  return (
    <nav
      {...rest}
      ref={mergeRefs(navRef, ref)}
      // Several trails on one page need distinct names: pass `aria-label`, or `aria-labelledby` to name it by a heading.
      aria-label={ariaLabel ?? (rest['aria-labelledby'] ? undefined : 'Breadcrumb')}
      className={cx('ui-breadcrumbs', className)}
    >
      <ol ref={listRef} className="ui-breadcrumbs__list">
        {visible.map((item, index) => (
          <li key={index} className="ui-breadcrumbs__item">
            {item === 'ellipsis' ? (
              <DropdownMenu
                trigger={
                  <button
                    type="button"
                    className="ui-breadcrumbs__ellipsis"
                    aria-label={ellipsisLabel(hidden.length)}
                  >
                    <MoreHorizontalIcon />
                  </button>
                }
                items={hidden.map((entry) => ({
                  label: entry.label,
                  icon: entry.icon,
                  href: entry.href,
                  onSelect: entry.onClick,
                }))}
              />
            ) : (
              <Crumb item={item} current={index === visible.length - 1} />
            )}
            {/* Trailing, so a wrapped line (markup without script) ends with a separator instead of starting with one. */}
            {index < visible.length - 1 && (
              <span className="ui-breadcrumbs__separator" aria-hidden="true">
                {separator}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** The path's natural width: first to last crumb, plus whatever the current page's ellipsis hides. */
function pathWidth(list: HTMLElement) {
  const first = list.firstElementChild;
  const last = list.lastElementChild;
  if (!first || !last) return 0;
  const a = first.getBoundingClientRect();
  const b = last.getBoundingClientRect();
  const label = last.querySelector<HTMLElement>('.ui-breadcrumbs__label');
  return Math.max(a.right, b.right) - Math.min(a.left, b.left) + (label ? label.scrollWidth - label.clientWidth : 0);
}

/**
 * How many more middle crumbs to fold into the ellipsis menu so the path fits its width, before the
 * current page ellipsizes or the path scrolls; fewer again as the room grows back. The path is measured
 * at each fold level visited, and the least folding that fits wins. Only for a path that fills its
 * width (a block-level root): a track that hugs its crumbs (inline-flex, as Glass's capsule) has no
 * spare room to measure, so it scrolls instead.
 */
function useAutoFold(
  navRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLElement | null>,
  key: string,
  maxFold: number,
) {
  const [state, setState] = useState({ key, fold: 0 });
  const fold = state.key === key ? Math.min(state.fold, maxFold) : 0;
  const widths = useRef<{ key: string; at: number[] }>({ key, at: [] });
  useLayoutEffect(() => {
    const nav = navRef.current;
    const list = listRef.current;
    if (!nav || !list) return;
    if (widths.current.key !== key) widths.current = { key, at: [] };
    const at = widths.current.at;
    const check = () => {
      const style = getComputedStyle(nav);
      if (style.display !== 'flex') return;
      // Measured on one line (markup without script wraps; see useOverflowScroll).
      if (!list.hasAttribute('data-overflow')) list.setAttribute('data-overflow', 'false');
      const room = nav.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      at[fold] = pathWidth(list);
      let next = at.findIndex((width) => width !== undefined && width <= room + 0.5);
      if (next < 0) next = Math.min(fold + 1, maxFold);
      if (next !== fold) setState({ key, fold: next });
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [navRef, listRef, key, fold, maxFold]);
  return fold;
}

/** True while the text in `ref` is cut off by its ellipsis. */
function useTruncated(ref: RefObject<HTMLElement | null>, text: string) {
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const check = () => setTruncated(element.scrollWidth > element.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, text]);
  return truncated;
}

/**
 * The current page gives way (ellipsis) only down to min(8em, its natural width); past that the path
 * scrolls instead. CSS can't take min() of an intrinsic size, so the natural width is measured onto
 * `--_natural-w` of its item.
 */
function useShrinkFloor(ref: RefObject<HTMLElement | null>, text: string, enabled: boolean) {
  useLayoutEffect(() => {
    const label = ref.current;
    const item = label?.closest<HTMLElement>('.ui-breadcrumbs__item');
    if (!enabled || !label || !item) return;
    // The item's width plus whatever the label hides; +1 absorbs sub-pixel rounding.
    const measure = () =>
      item.style.setProperty('--_natural-w', `${item.offsetWidth + label.scrollWidth - label.clientWidth + 1}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(label);
    return () => {
      observer.disconnect();
      item.style.removeProperty('--_natural-w');
    };
  }, [ref, text, enabled]);
}

/** A crumb whose label is cut off shows the full label in a tooltip (hover, or keyboard focus on links). */
function Crumb({ item, current }: { item: BreadcrumbItem; current: boolean }) {
  const labelRef = useRef<HTMLSpanElement>(null);
  const truncated = useTruncated(labelRef, item.label);
  useShrinkFloor(labelRef, item.label, current);
  return (
    <Tooltip content={item.label} disabled={!truncated} delay={300}>
      {renderCrumb(item, current, labelRef)}
    </Tooltip>
  );
}

function renderCrumb(item: BreadcrumbItem, current: boolean, labelRef: RefObject<HTMLSpanElement | null>) {
  const content = (
    <>
      {item.icon && <span className="ui-breadcrumbs__icon">{item.icon}</span>}
      <span ref={labelRef} className="ui-breadcrumbs__label">
        {item.label}
      </span>
    </>
  );
  if (item.href) {
    return (
      <a
        href={item.href}
        className="ui-breadcrumbs__link"
        aria-current={current ? 'page' : undefined}
        onClick={item.onClick}
      >
        {content}
      </a>
    );
  }
  if (current) {
    return (
      <span className="ui-breadcrumbs__link" aria-current="page">
        {content}
      </span>
    );
  }
  if (item.onClick) {
    return (
      <button type="button" className="ui-breadcrumbs__link" onClick={item.onClick}>
        {content}
      </button>
    );
  }
  return <span className="ui-breadcrumbs__link">{content}</span>;
}
