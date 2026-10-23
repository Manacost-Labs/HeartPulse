'use client';

import { useRef, useState, type ComponentPropsWithRef, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { Slot, useControllableState, type Placement } from '../primitives';
import { childElements, collectionPart } from '../primitives/compound';
import { MenuPopup, type MenuActionItem, type MenuCheckboxItem, type MenuHighlight, type MenuItem } from './Menu';
import { withRef, useId } from '../primitives/react-compat';

/** Native attributes, `style` and `ref` go to the menu surface. */
export interface DropdownMenuProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** A single focusable element, usually a Button. Receives the menu-button ARIA and handlers. Or `DropdownMenu.Trigger`. */
  trigger?: ReactElement;
  /**
   * Menu rows: actions (with optional submenus), checkboxes, radio groups, separators and labels. Or compose them as
   * children: `DropdownMenu.Item`, `.CheckboxItem`, `.Label`, `.Separator`.
   */
  items?: MenuItem[];
  /** The compound form: a `DropdownMenu.Trigger` and the rows, instead of `trigger` and `items`. */
  children?: ReactNode;
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

export interface DropdownMenuTriggerProps {
  /** A single focusable element, usually a Button. */
  children: ReactElement;
}

export interface DropdownMenuItemProps extends Omit<MenuActionItem, 'type' | 'label'> {
  /** The row's label (plain text: type-ahead reads it). */
  children: string;
}

export interface DropdownMenuCheckboxItemProps extends Omit<MenuCheckboxItem, 'type' | 'label'> {
  /** The row's label. */
  children: string;
}

export interface DropdownMenuLabelProps {
  /** Heading text of the rows that follow. */
  children: string;
}

/** The element that opens the menu (`DropdownMenu.Trigger`). */
export const DropdownMenuTrigger = collectionPart<DropdownMenuTriggerProps>('DropdownMenu.Trigger');
/** An action row (`DropdownMenu.Item`): the props of a MenuActionItem, with the label as children. */
export const DropdownMenuItem = collectionPart<DropdownMenuItemProps>('DropdownMenu.Item');
/** A row with a checkbox (`DropdownMenu.CheckboxItem`). */
export const DropdownMenuCheckboxItem = collectionPart<DropdownMenuCheckboxItemProps>('DropdownMenu.CheckboxItem');
/** A heading row (`DropdownMenu.Label`). */
export const DropdownMenuLabel = collectionPart<DropdownMenuLabelProps>('DropdownMenu.Label');
/** A divider between groups of rows (`DropdownMenu.Separator`). */
export const DropdownMenuSeparator = collectionPart<Record<never, never>>('DropdownMenu.Separator');

function menuFromParts(children: ReactNode): { trigger?: ReactElement; items: MenuItem[] } {
  const elements = childElements(children);
  const trigger = elements.find((child) => child.type === DropdownMenuTrigger) as ReactElement<DropdownMenuTriggerProps> | undefined;
  const items = elements.flatMap((child): MenuItem[] => {
    const props = child.props as { children?: ReactNode };
    if (child.type === DropdownMenuItem) {
      const { children: label, ...item } = props as DropdownMenuItemProps;
      return [{ ...item, label }];
    }
    if (child.type === DropdownMenuCheckboxItem) {
      const { children: label, ...item } = props as DropdownMenuCheckboxItemProps;
      return [{ ...item, type: 'checkbox', label }];
    }
    if (child.type === DropdownMenuLabel) return [{ type: 'label', label: (props as DropdownMenuLabelProps).children }];
    if (child.type === DropdownMenuSeparator) return [{ type: 'separator' }];
    return [];
  });
  return { trigger: trigger?.props.children, items };
}

export const DropdownMenu = withRef(function DropdownMenu({
  trigger: triggerProp,
  items: itemsProp,
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  placement = 'bottom-start',
  className,
  ...rest
}: DropdownMenuProps) {
  const parts = triggerProp && itemsProp ? undefined : menuFromParts(children);
  const trigger = triggerProp ?? parts?.trigger;
  const items = itemsProp ?? parts?.items ?? [];
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const [highlight, setHighlight] = useState<MenuHighlight>('none');
  const triggerRef = useRef<HTMLElement>(null);
  const menuId = useId();
  const triggerId = (trigger?.props as { id?: string } | undefined)?.id ?? `${menuId}-trigger`;

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
}, {
  Trigger: DropdownMenuTrigger,
  Item: DropdownMenuItem,
  CheckboxItem: DropdownMenuCheckboxItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
});
