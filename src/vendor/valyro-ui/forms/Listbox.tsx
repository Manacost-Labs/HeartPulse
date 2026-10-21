'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CheckIcon } from '../icons';
import './Listbox.css';
import { useLayoutEffect } from '../primitives/react-compat';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

/** A single option or a labelled group of options. */
export type SelectItem = SelectOption | SelectOptionGroup;

export function isOptionGroup(item: SelectItem): item is SelectOptionGroup {
  return 'options' in item;
}

export function flattenItems(items: SelectItem[]): SelectOption[] {
  return items.flatMap((item) => (isOptionGroup(item) ? item.options : [item]));
}

/** Keeps matching options; groups left without options are dropped. */
export function filterItems(items: SelectItem[], keep: (option: SelectOption) => boolean): SelectItem[] {
  const out: SelectItem[] = [];
  for (const item of items) {
    if (!isOptionGroup(item)) {
      if (keep(item)) out.push(item);
      continue;
    }
    const options = item.options.filter(keep);
    if (options.length) out.push({ ...item, options });
  }
  return out;
}

export function matchesQuery(option: SelectOption, query: string) {
  return option.label.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * The ids of a field's `<label for>` elements while its popup is open, so the listbox is named like the field
 * (a listbox without a name fails WCAG 4.1.2). Labels without an id get one derived from `baseId`.
 */
export function useFieldLabelIds(fieldRef: RefObject<HTMLInputElement | HTMLButtonElement | null>, open: boolean, baseId: string) {
  const [ids, setIds] = useState<string>();
  useLayoutEffect(() => {
    if (!open) return;
    const labels = fieldRef.current?.labels;
    const next = labels?.length ? Array.from(labels, (label, i) => label.id || (label.id = `${baseId}-label-${i}`)).join(' ') : undefined;
    setIds((current) => (current === next ? current : next));
  }, [open, fieldRef, baseId]);
  return ids;
}

export function firstEnabledIndex(options: SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

export const optionId = (listId: string, index: number) => `${listId}-option-${index}`;

interface ListboxProps {
  id: string;
  items: SelectItem[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  isSelected: (value: string) => boolean;
  onSelect: (index: number) => void;
  /** `check` — trailing checkmark (single select); `checkbox` — leading checkbox (multi select). */
  indicator: 'check' | 'checkbox';
  multiple?: boolean;
  label?: string;
  labelledBy?: string;
  /** Shown below the (empty) listbox when there are no options; announced politely when it appears. */
  emptyState?: ReactNode;
}

/**
 * Option list shared by Select, MultiSelect and Combobox. DOM focus stays on
 * the owning trigger/input; the active row is exposed via aria-activedescendant.
 */
export function Listbox({
  id,
  items,
  activeIndex,
  onActiveIndexChange,
  isSelected,
  onSelect,
  indicator,
  multiple,
  label,
  labelledBy,
  emptyState,
}: ListboxProps) {
  const listRef = useRef<HTMLDivElement>(null);
  // Hover already shows the row; scrolling it into view would make the list jump under the pointer.
  const fromPointer = useRef(false);

  useEffect(() => {
    if (fromPointer.current) {
      fromPointer.current = false;
      return;
    }
    const option = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    if (!option) return;
    option.scrollIntoView({ block: 'nearest' });
    // Reaching the first row of a group also reveals the group's label above it.
    const group = option.closest('[role="group"]');
    if (group?.querySelector('[role="option"]') === option) group.firstElementChild?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  let index = -1;
  const renderOption = (option: SelectOption) => {
    index += 1;
    const i = index;
    const selected = isSelected(option.value);
    return (
      <div
        key={option.value}
        id={optionId(id, i)}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        data-index={i}
        data-highlighted={i === activeIndex}
        className="ui-menu-item ui-listbox__option"
        onPointerMove={() => {
          if (option.disabled || i === activeIndex) return;
          fromPointer.current = true;
          onActiveIndexChange(i);
        }}
        onClick={() => {
          if (!option.disabled) onSelect(i);
        }}
      >
        {indicator === 'checkbox' && (
          <span className="ui-listbox__checkbox" data-checked={selected}>
            <CheckIcon size={12} strokeWidth={3} />
          </span>
        )}
        {option.icon && <span className="ui-menu-item__icon">{option.icon}</span>}
        <span className="ui-listbox__text">
          <span className="ui-menu-item__label">{option.label}</span>
          {option.description && <span className="ui-listbox__description">{option.description}</span>}
        </span>
        {indicator === 'check' && (
          <span className="ui-listbox__check" data-checked={selected}>
            <CheckIcon />
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <div
        ref={listRef}
        id={id}
        role="listbox"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-multiselectable={multiple || undefined}
        className="ui-listbox"
        data-indicator={indicator}
      >
        {items.map((item, itemIndex) => {
          if (!isOptionGroup(item)) return renderOption(item);
          const groupLabelId = `${id}-group-${itemIndex}`;
          return (
            <Fragment key={groupLabelId}>
              {itemIndex > 0 && <div role="none" className="ui-menu-separator" />}
              <div role="group" aria-labelledby={groupLabelId}>
                <div id={groupLabelId} role="presentation" className="ui-menu-label">
                  {item.label}
                </div>
                {item.options.map(renderOption)}
              </div>
            </Fragment>
          );
        })}
      </div>
      {/* Kept mounted so screen readers announce "No results" / "Loading…" as the list changes. */}
      {emptyState !== undefined && (
        <div role="status" className="ui-listbox__empty">
          {items.length === 0 ? emptyState : null}
        </div>
      )}
    </>
  );
}
