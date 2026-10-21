'use client';

import { useId, useMemo, useRef, type ComponentPropsWithRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronDownIcon } from '../icons';
import { composeHandlers, cx, Floating, mergeRefs, useControllableState, useListNavigation } from '../primitives';
import { firstEnabledIndex, flattenItems, Listbox, optionId, useFieldLabelIds, type SelectItem } from './Listbox';
import './Select.css';

export interface SelectProps
  extends Omit<ComponentPropsWithRef<'button'>, 'value' | 'defaultValue' | 'onChange' | 'children' | 'type'> {
  /** Options to pick from, flat or in labelled groups. */
  options: SelectItem[];
  /** Selected option value; an empty string means nothing is selected. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Trigger text while nothing is selected. */
  placeholder?: string;
  /** Shown in the popover when `options` is empty. */
  emptyText?: ReactNode;
  /** Trigger height and text size. */
  size?: 'sm' | 'md' | 'lg';
  /** Error border and aria-invalid on the trigger (an explicit `aria-invalid` wins). */
  invalid?: boolean;
  /** Submits the value with the surrounding form through a hidden input. */
  name?: string;
}

/** Select-only combobox: a field-styled trigger that opens a listbox. Props not listed go to the trigger button. */
export function Select({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  placeholder = 'Select…',
  emptyText = 'No options',
  size = 'md',
  invalid = false,
  name,
  disabled,
  className,
  ref,
  onClick,
  onKeyDown,
  'aria-invalid': ariaInvalid,
  ...rest
}: SelectProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue: defaultValue ?? '', onChange: onValueChange });
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen ?? false, onChange: onOpenChange });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const flat = useMemo(() => flattenItems(options), [options]);
  const selectedIndex = flat.findIndex((option) => option.value === value);
  const selected = flat[selectedIndex];
  const startIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(flat);

  const choose = (index: number) => {
    setValue(flat[index].value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const nav = useListNavigation({
    count: flat.length,
    isDisabled: (i) => !!flat[i].disabled,
    getLabel: (i) => flat[i].label,
    onSelect: choose,
    initialIndex: open ? startIndex : -1,
  });

  const show = () => {
    nav.setActiveIndex(startIndex);
    setOpen(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        show();
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        // Type-ahead on a closed select opens it on the first match.
        setOpen(true);
        nav.onKeyDown(event);
      }
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    nav.onKeyDown(event);
  };

  const fieldLabelIds = useFieldLabelIds(triggerRef, open, listId);

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    // Keyboard-generated clicks (detail 0, e.g. Space keyup) are already handled in onKeyDown.
    if (event.detail === 0) return;
    // Safari does not focus buttons on click; keyboard navigation needs focus on the trigger.
    event.currentTarget.focus();
    if (open) setOpen(false);
    else show();
  };

  return (
    <>
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && nav.activeIndex >= 0 ? optionId(listId, nav.activeIndex) : undefined}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        {...rest}
        ref={mergeRefs(triggerRef, ref)}
        disabled={disabled}
        className={cx('ui-field', 'ui-select', className)}
        data-size={size}
        data-invalid={invalid || undefined}
        data-disabled={disabled || undefined}
        data-open={open || undefined}
        data-placeholder={selected ? undefined : ''}
        onClick={composeHandlers(onClick, handleClick)}
        onKeyDown={composeHandlers(onKeyDown, handleKeyDown)}
      >
        {selected?.icon && <span className="ui-field__icon ui-select__icon">{selected.icon}</span>}
        <span className="ui-select__value">{selected ? selected.label : placeholder}</span>
        <ChevronDownIcon className="ui-select__chevron" />
      </button>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <Floating
        open={open && !disabled}
        anchorRef={triggerRef}
        placement="bottom-start"
        offset={6}
        matchAnchorWidth
        onDismiss={() => setOpen(false)}
        className="ui-listbox__popover"
        // Keeps focus on the trigger while clicking rows.
        onMouseDown={(event) => event.preventDefault()}
      >
        <Listbox
          id={listId}
          items={options}
          activeIndex={nav.activeIndex}
          onActiveIndexChange={nav.setActiveIndex}
          isSelected={(v) => v === value}
          onSelect={choose}
          indicator="check"
          label={rest['aria-label']}
          labelledBy={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : fieldLabelIds)}
          emptyState={emptyText}
        />
      </Floating>
    </>
  );
}
