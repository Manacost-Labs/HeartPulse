'use client';

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { CheckIcon, ChevronRightIcon } from '../icons';
import {
  cx,
  Floating,
  inlineArrowStep,
  mergeRefs,
  useDirection,
  useListNavigation,
  type FloatingProps,
} from '../primitives';
import { usePointerMoved } from './internal';
import './Menu.css';

/*
 * Shared menu model and renderer for DropdownMenu, ContextMenu and the
 * collapsed menus of Breadcrumbs / Sidebar. Not exported from the library;
 * only the item types are public.
 */

export interface MenuActionItem {
  type?: 'item';
  label: string;
  icon?: ReactNode;
  /** Shortcut hint shown on the right, e.g. "⌘C". Display only. */
  shortcut?: string;
  /** Renders the row as a link. */
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  /** Child items shown in a submenu that opens on hover or ArrowRight (ArrowLeft in RTL). */
  items?: MenuItem[];
}

export interface MenuCheckboxItem {
  type: 'checkbox';
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export interface MenuRadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface MenuRadioGroup {
  type: 'radio';
  /** Heading shown above the options. */
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: MenuRadioOption[];
}

export interface MenuSeparatorItem {
  type: 'separator';
}

export interface MenuLabelItem {
  type: 'label';
  label: string;
}

export type MenuItem = MenuActionItem | MenuCheckboxItem | MenuRadioGroup | MenuSeparatorItem | MenuLabelItem;

/** Rows reachable by keyboard, in render order. */
type Entry =
  | { kind: 'action'; item: MenuActionItem }
  | { kind: 'checkbox'; item: MenuCheckboxItem }
  | { kind: 'radio'; group: MenuRadioGroup; option: MenuRadioOption };

function collectEntries(items: MenuItem[]): Entry[] {
  const entries: Entry[] = [];
  for (const item of items) {
    if (item.type === 'radio') item.options.forEach((option) => entries.push({ kind: 'radio', group: item, option }));
    else if (item.type === 'checkbox') entries.push({ kind: 'checkbox', item });
    else if (item.type === undefined || item.type === 'item') entries.push({ kind: 'action', item: item as MenuActionItem });
  }
  return entries;
}

const entryLabel = (entry: Entry) => (entry.kind === 'radio' ? entry.option.label : entry.item.label);
const entryDisabled = (entry: Entry | undefined) =>
  !entry || !!(entry.kind === 'radio' ? entry.option.disabled : entry.item.disabled);

export type MenuHighlight = 'first' | 'last' | 'none';

export interface MenuPopupProps extends Omit<FloatingProps, 'children' | 'onDismiss'> {
  items: MenuItem[];
  /** Row highlighted on open: keyboard openers start on the first/last row. */
  initialHighlight?: MenuHighlight;
  /** Move DOM focus into the menu on open (off for submenus opened by hover). */
  focusOnOpen?: boolean;
  /** Closes the whole menu tree; `returnFocus` sends focus back to whatever opened it. */
  onClose: (returnFocus: boolean) => void;
  /** Submenus only: close this level and hand focus back to the parent menu. */
  onBack?: () => void;
}

/** Remounts the menu body on every open so highlight and submenu state start fresh. */
export function MenuPopup(props: MenuPopupProps) {
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(props.open);
  if (props.open !== wasOpen) {
    setWasOpen(props.open);
    if (props.open) setSession((s) => s + 1);
  }
  return <MenuSurface key={session} {...props} />;
}

function MenuSurface({
  items,
  open,
  initialHighlight = 'none',
  focusOnOpen = true,
  onClose,
  onBack,
  className,
  ref,
  ...floatingProps
}: MenuPopupProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  // Submenus open towards the inline end and the arrows follow: right in LTR, left in RTL.
  const direction = useDirection(surfaceRef);
  const anchors = useRef<Record<number, RefObject<HTMLElement | null>>>({});
  const baseId = useId();
  const entries = useMemo(() => collectEntries(items), [items]);
  const isDisabled = (index: number) => entryDisabled(entries[index]);
  const rowId = (index: number) => `${baseId}-item-${index}`;
  const firstEnabled = entries.findIndex((entry) => !entryDisabled(entry));
  // HearthPulse: the project compiles against ES2022, which has no findLastIndex.
  let lastEnabled = entries.length - 1;
  while (lastEnabled >= 0 && entryDisabled(entries[lastEnabled])) lastEnabled -= 1;

  const [sub, setSub] = useState<{ index: number; keyboard: boolean } | null>(null);
  const hoverTimer = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const pointerMoved = usePointerMoved();

  const activate = (index: number, viaKeyboard: boolean) => {
    const entry = entries[index];
    if (!entry || isDisabled(index)) return;
    if (entry.kind === 'action' && entry.item.items) {
      // The submenu belongs to the highlighted row: a tap (no pointermove before it) or a screen reader's
      // double-tap highlights the row first, or the submenu would close in the same render.
      setActiveIndex(index);
      setSub({ index, keyboard: viaKeyboard });
      return;
    }
    if (entry.kind === 'action' && entry.item.href && viaKeyboard) {
      // A real click keeps native link behaviour; the row's onClick then closes the menu.
      document.getElementById(rowId(index))?.click();
      return;
    }
    onClose(true);
    if (entry.kind === 'action') entry.item.onSelect?.();
    else if (entry.kind === 'checkbox') entry.item.onCheckedChange(!entry.item.checked);
    else entry.group.onValueChange(entry.option.value);
  };

  const { activeIndex, setActiveIndex, onKeyDown } = useListNavigation({
    count: entries.length,
    isDisabled,
    getLabel: (index) => entryLabel(entries[index]),
    onSelect: (index) => activate(index, true),
    initialIndex: initialHighlight === 'first' ? firstEnabled : initialHighlight === 'last' ? lastEnabled : -1,
  });

  // A submenu belongs to the highlighted row; moving the highlight away closes it.
  if (sub && sub.index !== activeIndex) setSub(null);

  // animation="spring": one highlight glides from row to row instead of each row lighting up on its own.
  const spring = floatingProps.animation === 'spring';
  const glideRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const glide = glideRef.current;
    if (!glide) return;
    const row = activeIndex >= 0 ? document.getElementById(`${baseId}-item-${activeIndex}`) : null;
    if (!row) {
      glide.removeAttribute('data-visible');
      return;
    }
    // The first highlight appears in place; only later moves glide.
    glide.style.transition = glide.hasAttribute('data-visible') ? '' : 'none';
    glide.style.transform = `translateY(${row.offsetTop}px)`;
    glide.style.height = `${row.offsetHeight}px`;
    glide.toggleAttribute('data-danger', row.hasAttribute('data-danger'));
    glide.setAttribute('data-visible', '');
  }, [activeIndex, baseId]);

  useEffect(() => {
    if (!open || !focusOnOpen) return;
    // Floating stays visibility:hidden until its first measurement, and hidden elements can't take focus.
    const frame = requestAnimationFrame(() => surfaceRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open, focusOnOpen]);

  useEffect(() => {
    if (activeIndex >= 0) document.getElementById(`${baseId}-item-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, baseId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Keys pressed in a (portaled) submenu bubble here through the React tree; that level handles them.
    if (!event.currentTarget.contains(event.target as Node)) return;
    const entry = entries[activeIndex];
    const inline = inlineArrowStep(event.key, direction);
    if (event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    } else if (inline === 1 && entry?.kind === 'action' && entry.item.items && !isDisabled(activeIndex)) {
      event.preventDefault();
      setSub({ index: activeIndex, keyboard: true });
    } else if (inline === -1 && onBack) {
      event.preventDefault();
      onBack();
    } else {
      onKeyDown(event);
    }
  };

  // Labels line up with row text when any row has an icon or check column.
  const inset = entries.some((entry) => entry.kind !== 'action' || !!entry.item.icon);
  let counter = -1;

  const renderRow = (entry: Entry) => {
    const index = ++counter;
    const disabled = isDisabled(index);
    const submenu = entry.kind === 'action' ? entry.item.items : undefined;
    const subOpen = !!submenu && sub?.index === index;
    const checked =
      entry.kind === 'checkbox'
        ? entry.item.checked
        : entry.kind === 'radio'
          ? entry.group.value === entry.option.value
          : undefined;
    const shortcut = entry.kind === 'radio' ? undefined : entry.item.shortcut;
    const href = entry.kind === 'action' && !disabled ? entry.item.href : undefined;
    const anchorRef = submenu ? (anchors.current[index] ??= { current: null }) : undefined;

    const props = {
      id: rowId(index),
      ref: anchorRef ? (node: HTMLElement | null) => void (anchorRef.current = node) : undefined,
      role: entry.kind === 'checkbox' ? 'menuitemcheckbox' : entry.kind === 'radio' ? 'menuitemradio' : 'menuitem',
      'aria-checked': checked,
      'aria-disabled': disabled || undefined,
      'aria-haspopup': submenu ? ('menu' as const) : undefined,
      'aria-expanded': submenu ? subOpen : undefined,
      className: 'ui-menu-item',
      'data-highlighted': activeIndex === index || undefined,
      'data-danger': (entry.kind === 'action' && entry.item.danger) || undefined,
      onPointerMove: (event: PointerEvent) => {
        if (!pointerMoved(event)) return;
        window.clearTimeout(hoverTimer.current);
        if (disabled) {
          if (!sub && activeIndex !== -1) setActiveIndex(-1);
          return;
        }
        const hover = () => {
          setActiveIndex(index);
          if (submenu) setSub({ index, keyboard: false });
        };
        if (sub && sub.index !== index) {
          // Grace period: a diagonal move toward the open submenu crosses other rows without closing it.
          hoverTimer.current = window.setTimeout(hover, 150);
        } else if (activeIndex !== index || (submenu && !sub)) {
          hover();
        }
      },
      onClick: (event: MouseEvent) => {
        if (disabled) event.preventDefault();
        else activate(index, false);
      },
    };

    const content = (
      <>
        {entry.kind !== 'action' ? (
          <span className="ui-menu__indicator" aria-hidden="true">
            {checked && (entry.kind === 'checkbox' ? <CheckIcon size={14} strokeWidth={2.25} /> : <span className="ui-menu__dot" />)}
          </span>
        ) : entry.item.icon ? (
          <span className="ui-menu-item__icon">{entry.item.icon}</span>
        ) : (
          inset && <span className="ui-menu__indicator" aria-hidden="true" />
        )}
        <span className="ui-menu-item__label">{entryLabel(entry)}</span>
        {shortcut && <span className="ui-menu-item__hint ui-menu__shortcut">{shortcut}</span>}
        {submenu && (
          <span className="ui-menu-item__hint" aria-hidden="true">
            <ChevronRightIcon size={14} />
          </span>
        )}
      </>
    );

    return (
      <Fragment key={`row-${index}`}>
        {href ? (
          <a {...props} href={href} tabIndex={-1}>
            {content}
          </a>
        ) : (
          <div {...props}>{content}</div>
        )}
        {submenu && anchorRef && (
          <MenuPopup
            open={subOpen && open}
            anchorRef={anchorRef}
            placement={direction === 'rtl' ? 'left-start' : 'right-start'}
            offset={6}
            animation={floatingProps.animation}
            items={submenu}
            initialHighlight={sub?.keyboard ? 'first' : 'none'}
            focusOnOpen={!!sub?.keyboard}
            onClose={onClose}
            onPointerEnter={() => window.clearTimeout(hoverTimer.current)}
            onBack={() => {
              setSub(null);
              surfaceRef.current?.focus({ preventScroll: true });
            }}
          />
        )}
      </Fragment>
    );
  };

  return (
    <Floating
      {...floatingProps}
      ref={mergeRefs(surfaceRef, ref)}
      open={open}
      role="menu"
      tabIndex={-1}
      aria-activedescendant={activeIndex >= 0 ? rowId(activeIndex) : undefined}
      className={cx('ui-menu', className)}
      data-submenu={onBack ? '' : undefined}
      data-inset={inset || undefined}
      data-motion={spring ? 'spring' : undefined}
      onDismiss={(reason) => (onBack ? onBack() : onClose(reason === 'escape'))}
      onKeyDown={handleKeyDown}
      onPointerLeave={() => {
        window.clearTimeout(hoverTimer.current);
        if (!sub) setActiveIndex(-1);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {spring && <span ref={glideRef} className="ui-menu__glide" aria-hidden="true" />}
      {items.map((item, i) => {
        if (item.type === 'separator') return <div key={i} role="separator" className="ui-menu-separator" />;
        if (item.type === 'label') {
          return (
            <div key={i} className="ui-menu-label">
              {item.label}
            </div>
          );
        }
        if (item.type === 'radio') {
          const labelId = `${baseId}-group-${i}`;
          return (
            <div key={i} role="group" aria-labelledby={item.label ? labelId : undefined}>
              {item.label && (
                <div id={labelId} className="ui-menu-label">
                  {item.label}
                </div>
              )}
              {item.options.map((option) => renderRow({ kind: 'radio', group: item, option }))}
            </div>
          );
        }
        return renderRow(item.type === 'checkbox' ? { kind: 'checkbox', item } : { kind: 'action', item });
      })}
    </Floating>
  );
}
