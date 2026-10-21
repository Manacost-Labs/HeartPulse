'use client';

import { useId, useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react';
import { Slot, useControllableState, type Placement } from '../primitives';
import { MenuPopup, type MenuHighlight, type MenuItem } from './Menu';

/** Native attributes, `style` and `ref` go to the menu surface. */
export interface DropdownMenuProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** A single focusable element, usually a Button. Receives the menu-button ARIA and handlers. */
  trigger: ReactElement;
  /** Menu rows: actions (with optional submenus), checkboxes, radio groups, separators and labels. */
  items: MenuItem[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Preferred side and alignment relative to the trigger; flips when there is no room. */
  placement?: Placement;
  /** `pop` (default): the theme's enter. `spring`: the menu and its submenus spring open and one highlight glides between rows. */
  animation?: 'pop' | 'spring';
  /** Class for the menu surface. */
  className?: string;
}

export function DropdownMenu({
  trigger,
  items,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom-start',
  className,
  ...rest
}: DropdownMenuProps) {
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const [highlight, setHighlight] = useState<MenuHighlight>('none');
  const triggerRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const triggerId = (trigger.props as { id?: string }).id ?? `${menuId}-trigger`;

  const show = (initial: MenuHighlight) => {
    setHighlight(initial);
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  return (
    <>
      <Slot
        ref={triggerRef}
        id={triggerId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-state={open ? 'open' : 'closed'}
        // detail === 0 means Enter/Space activated the button, so start on the first row.
        onClick={(event: MouseEvent) => (open ? close(false) : show(event.detail === 0 ? 'first' : 'none'))}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          show(event.key === 'ArrowDown' ? 'first' : 'last');
        }}
      >
        {trigger}
      </Slot>
      <MenuPopup
        {...rest}
        id={menuId}
        open={open}
        anchorRef={triggerRef}
        placement={placement}
        offset={6}
        items={items}
        initialHighlight={highlight}
        onClose={close}
        aria-labelledby={triggerId}
        className={className}
      />
    </>
  );
}
