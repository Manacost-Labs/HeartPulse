'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ComponentPropsWithRef, type FocusEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ChevronsUpDownIcon } from '../icons';
import { composeHandlers, cx, Floating, mergeRefs, useControllableState, useListNavigation } from '../primitives';
import { Spinner } from '../basic/Spinner';
import {
  filterItems,
  firstEnabledIndex,
  flattenItems,
  Listbox,
  matchesQuery,
  optionId,
  useFieldLabelIds,
  type SelectItem,
  type SelectOption,
} from './Listbox';
import './Combobox.css';
import { withRef, useId } from '../primitives/react-compat';

export interface ComboboxLabels {
  /** Popover text while `loading` and no options are shown. */
  loading: string;
  /** Popover hint with `allowCustomValue` when the typed text matches nothing. */
  useCustomValue: (text: string) => string;
  /** Accessible name of the chevron button. */
  toggleSuggestions: string;
}

export const defaultComboboxLabels: ComboboxLabels = {
  loading: 'Loading…',
  useCustomValue: (text) => `Press Enter to use “${text}”`,
  toggleSuggestions: 'Show suggestions',
};

export interface ComboboxProps
  extends Omit<ComponentPropsWithRef<'input'>, 'value' | 'defaultValue' | 'onChange' | 'size' | 'type' | 'role'> {
  /** Suggestions, flat or in labelled groups; filtered by the typed text unless `filter={false}`. */
  options: SelectItem[];
  /** Selected option value (or the typed text with `allowCustomValue`); empty string means none. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Text in the input. Control it together with `filter={false}` to load options asynchronously. */
  inputValue?: string;
  defaultInputValue?: string;
  /** Called with the text whenever the input changes (typing, picking an option, clearing). */
  onInputValueChange?: (text: string) => void;
  /**
   * Same as `onInputValueChange`.
   * @deprecated Use `onInputValueChange`, the library's `onXxxChange` name.
   */
  onInputChange?: (text: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom matcher, or `false` when `options` are already filtered (e.g. by a server). Default: label contains text. */
  filter?: false | ((option: SelectOption, query: string) => boolean);
  /** Shows a spinner in the field, sets aria-busy, and replaces the empty state with a loading message. */
  loading?: boolean;
  /** Shown in the popover when no option matches (unless `allowCustomValue` offers the typed text). */
  emptyText?: ReactNode;
  labels?: Partial<ComboboxLabels>;
  /** Typed text that matches no option is kept as the value on Enter / blur. */
  allowCustomValue?: boolean;
  /** Field height and text size. */
  size?: 'sm' | 'md' | 'lg';
  /** Error border and aria-invalid on the input (an explicit `aria-invalid` wins). */
  invalid?: boolean;
  /** Icon inside the field, before the text. */
  leftIcon?: ReactNode;
}

/** Editable combobox with list autocomplete. Props not listed go to the <input>; `name` submits the value. */
export const Combobox = withRef(function Combobox({
  options,
  value: valueProp,
  defaultValue,
  onValueChange,
  inputValue: inputValueProp,
  defaultInputValue,
  onInputValueChange,
  onInputChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  filter = matchesQuery,
  loading = false,
  emptyText = 'No results',
  labels: labelsProp,
  allowCustomValue = false,
  size = 'md',
  invalid = false,
  leftIcon,
  name,
  disabled,
  readOnly,
  className,
  style,
  ref,
  onKeyDown,
  onClick,
  onBlur,
  'aria-invalid': ariaInvalid,
  ...rest
}: ComboboxProps) {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue: defaultValue ?? '', onChange: onValueChange });
  const allOptions = useMemo(() => flattenItems(options), [options]);
  // Remembers the picked option so its label survives async option lists that no longer contain it.
  const picked = useRef<SelectOption | null>(null);
  const labelFor = (v: string) =>
    v === '' ? '' : (allOptions.find((option) => option.value === v)?.label ?? (picked.current?.value === v ? picked.current.label : v));

  const [text, setText] = useControllableState({
    value: inputValueProp,
    defaultValue: defaultInputValue ?? labelFor(value),
    onChange: (next) => {
      onInputValueChange?.(next);
      onInputChange?.(next);
    },
  });
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen ?? false, onChange: onOpenChange });
  const labels = { ...defaultComboboxLabels, ...labelsProp };
  // null = show every option (opened without typing); a string = filter by what was typed.
  const [query, setQuery] = useState<string | null>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const fieldLabelIds = useFieldLabelIds(inputRef, open, listId);

  const itemsFor = (q: string | null) => (q && filter ? filterItems(options, (option) => filter(option, q)) : options);
  // Filtered once per query, not on every render: moving the highlight over a long list re-renders on each row.
  const visibleItems = useMemo(() => itemsFor(query), [options, filter, query]);
  const flat = useMemo(() => flattenItems(visibleItems), [visibleItems]);

  // Show the label when the value changes from outside (e.g. a form reset).
  const lastValue = useRef(value);
  useEffect(() => {
    if (lastValue.current === value) return;
    lastValue.current = value;
    if (query === null) setText(labelFor(value));
  });

  const close = () => {
    setOpen(false);
    setQuery(null);
  };

  const selectOption = (option: SelectOption) => {
    picked.current = option;
    lastValue.current = option.value;
    setValue(option.value);
    setText(option.label);
    close();
  };

  const nav = useListNavigation({
    count: flat.length,
    isDisabled: (i) => !!flat[i].disabled,
    onSelect: (i) => selectOption(flat[i]),
  });
  const activeIndex = nav.activeIndex < flat.length ? nav.activeIndex : -1;

  // The highlight follows the option, not its position: when new suggestions arrive (async search), Enter must not
  // pick whatever now sits at the old index. Typing resets it on purpose (handleChange), so that change is skipped.
  const highlighted = useRef<string | undefined>(undefined);
  const typed = useRef(false);
  const flatKey = useMemo(() => flat.map((option) => option.value).join('\u0000'), [flat]);
  useEffect(() => {
    if (typed.current) {
      typed.current = false;
      return;
    }
    const previous = highlighted.current;
    if (previous === undefined) return;
    const index = flat.findIndex((option) => option.value === previous);
    if (index !== nav.activeIndex) nav.setActiveIndex(index >= 0 ? index : allowCustomValue ? -1 : firstEnabledIndex(flat));
    // Runs when the list itself changes.
  }, [flatKey]);
  useEffect(() => {
    highlighted.current = activeIndex >= 0 ? flat[activeIndex]?.value : undefined;
    // A keystroke that left the list unchanged must not swallow the next real update.
    typed.current = false;
  });

  const show = () => {
    if (disabled || readOnly) return;
    const selectedIndex = allOptions.findIndex((option) => option.value === value);
    nav.setActiveIndex(selectedIndex >= 0 ? selectedIndex : -1);
    setQuery(null);
    setOpen(true);
  };

  /** Resolves free text into a value when the user leaves the field or presses Enter without a highlighted row. */
  const commitText = () => {
    const typed = text.trim();
    if (typed === '') {
      lastValue.current = '';
      setValue('');
      setText('');
      return;
    }
    const exact = allOptions.find((option) => !option.disabled && option.label.toLowerCase() === typed.toLowerCase());
    if (exact) selectOption(exact);
    else if (allowCustomValue) {
      lastValue.current = typed;
      setValue(typed);
    } else setText(labelFor(value));
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setText(next);
    setQuery(next);
    setOpen(true);
    const nextFlat = flattenItems(itemsFor(next));
    typed.current = true;
    nav.setActiveIndex(allowCustomValue || next.trim() === '' ? -1 : firstEnabledIndex(nextFlat));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME composition (Japanese, Chinese, Korean): Enter and Escape confirm or cancel the conversion, not the field.
    // keyCode 229: Safari reports the composition's last keydown with isComposing false.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (!open) {
          event.preventDefault();
          show();
          return;
        }
        break;
      case 'Enter':
        if (!open) return;
        event.preventDefault();
        if (activeIndex >= 0) selectOption(flat[activeIndex]);
        else {
          commitText();
          close();
        }
        return;
      case 'Tab':
        if (open) close();
        return;
      // Space, Home and End edit the text instead of moving through the list.
      case ' ':
      case 'Home':
      case 'End':
        return;
    }
    if (open) nav.onKeyDown(event);
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (fieldRef.current?.contains(event.relatedTarget)) return;
    close();
    commitText();
  };

  const handleClick = (event: MouseEvent<HTMLInputElement>) => {
    if (!open && event.detail > 0) show();
  };

  const showEmpty = loading ? (
    <>
      <Spinner size={14} label={null} />
      {labels.loading}
    </>
  ) : allowCustomValue && text.trim() ? (
    labels.useCustomValue(text.trim())
  ) : (
    emptyText
  );

  return (
    <div
      ref={fieldRef}
      className={cx('ui-field', 'ui-combobox', className)}
      style={style}
      data-size={size}
      data-invalid={invalid || undefined}
      data-disabled={disabled || undefined}
      data-open={open || undefined}
      onMouseDown={(event) => {
        // Clicks on padding or icons focus the input instead of blurring it.
        if (event.target !== inputRef.current) {
          event.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      {leftIcon && <span className="ui-field__icon">{leftIcon}</span>}
      <input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(listId, activeIndex) : undefined}
        aria-invalid={ariaInvalid ?? (invalid || undefined)}
        aria-busy={loading || undefined}
        autoComplete="off"
        spellCheck={false}
        {...rest}
        ref={mergeRefs(inputRef, ref)}
        className="ui-field__input ui-combobox__input"
        value={text}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
        onKeyDown={composeHandlers(onKeyDown, handleKeyDown)}
        onClick={composeHandlers(onClick, handleClick)}
        onBlur={composeHandlers(onBlur, handleBlur)}
      />
      {loading && <Spinner size={14} label={null} className="ui-combobox__spinner" />}
      <button
        type="button"
        tabIndex={-1}
        aria-label={labels.toggleSuggestions}
        aria-expanded={open}
        className="ui-combobox__toggle"
        disabled={disabled || readOnly}
        onClick={() => {
          if (open) close();
          else show();
          inputRef.current?.focus();
        }}
      >
        <ChevronsUpDownIcon />
      </button>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <Floating
        open={open && !disabled && !readOnly}
        anchorRef={fieldRef}
        placement="bottom-start"
        offset={6}
        matchAnchorWidth
        onDismiss={close}
        className="ui-listbox__popover"
        // Keeps focus in the input while clicking rows.
        onMouseDown={(event) => event.preventDefault()}
      >
        <Listbox
          id={listId}
          items={visibleItems}
          activeIndex={activeIndex}
          onActiveIndexChange={nav.setActiveIndex}
          isSelected={(v) => v === value}
          onSelect={(i) => selectOption(flat[i])}
          indicator="check"
          label={rest['aria-label']}
          labelledBy={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : fieldLabelIds)}
          emptyState={showEmpty}
        />
      </Floating>
    </div>
  );
});
