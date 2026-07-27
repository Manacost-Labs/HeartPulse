import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { ConstructedCardFilterOption } from './constructedCardFilterOptions';
import './ConstructedCardFilterSelect.css';

type ConstructedCardFilterSelectProps = {
  label: string;
  value: string;
  options: ConstructedCardFilterOption[];
  onChange: (value: string) => void;
  tourId?: string;
  className?: string;
  visual?: 'text' | 'class' | 'set' | 'stat' | 'rarity';
  align?: 'start' | 'end';
};

function enabledIndex(
  options: ConstructedCardFilterOption[],
  start: number,
  direction: 1 | -1,
): number {
  if (options.length === 0) return -1;
  let index = start;
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    index = (index + direction + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return -1;
}

export default function ConstructedCardFilterSelect({
  label,
  value,
  options,
  onChange,
  tourId,
  className = '',
  visual = 'text',
  align = 'start',
}: ConstructedCardFilterSelectProps) {
  const generatedId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [open, setOpen] = useState(false);
  const [resolvedAlign, setResolvedAlign] = useState(align);
  const selectedIndex = useMemo(
    () => Math.max(0, options.findIndex(option => option.value === value)),
    [options, value],
  );
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selectedOption = options[selectedIndex] ?? options[0];
  const labelId = `${generatedId}-label`;
  const buttonId = `${generatedId}-button`;
  const listboxId = `${generatedId}-listbox`;

  const resolveMenuAlignment = useCallback(() => {
    const rootBox = rootRef.current?.getBoundingClientRect();
    if (!rootBox) return;
    const menuWidth = Math.min(336, window.innerWidth - 32);
    const startOverflow = Math.max(0, rootBox.left + menuWidth - (window.innerWidth - 8));
    const endOverflow = Math.max(0, 8 - (rootBox.right - menuWidth));
    if (startOverflow === 0 && endOverflow === 0) {
      setResolvedAlign(align);
    } else {
      setResolvedAlign(startOverflow <= endOverflow ? 'start' : 'end');
    }
  }, [align]);

  useEffect(() => {
    if (!open) return undefined;
    resolveMenuAlignment();
    listRef.current?.focus();

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('resize', resolveMenuAlignment);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('resize', resolveMenuAlignment);
    };
  }, [open, resolveMenuAlignment]);

  const openFromButton = (direction: 1 | -1 = 1) => {
    const initial = options[selectedIndex]?.disabled
      ? enabledIndex(options, selectedIndex, direction)
      : selectedIndex;
    setActiveIndex(initial);
    setOpen(true);
  };

  const selectIndex = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  const moveActive = (direction: 1 | -1) => {
    setActiveIndex(current => enabledIndex(options, current, direction));
  };

  const onButtonKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openFromButton(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const boundary = event.key === 'Home' ? -1 : 0;
      setActiveIndex(enabledIndex(options, boundary, event.key === 'Home' ? 1 : -1));
      setOpen(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) setOpen(false);
      else openFromButton();
    }
  };

  const onListKeyDown = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const boundary = event.key === 'Home' ? -1 : 0;
      setActiveIndex(enabledIndex(options, boundary, event.key === 'Home' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectIndex(activeIndex);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') setOpen(false);
  };

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-option-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  return (
    <div
      ref={rootRef}
      className={`constructed-cards__filter${className ? ` ${className}` : ''}${open ? ' is-open' : ''}`}
      data-tour-id={tourId}
      data-visual={visual}
      data-align={resolvedAlign}
    >
      <span id={labelId}>{label}</span>
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        className="constructed-cards__filter-trigger"
        aria-labelledby={`${labelId} ${buttonId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => (open ? setOpen(false) : openFromButton())}
        onKeyDown={onButtonKeyDown}
      >
        <span className="constructed-cards__filter-value">
          {selectedOption?.icon && (
            <img src={selectedOption.icon} alt={selectedOption.iconAlt ?? ''} />
          )}
          <span>{selectedOption?.label ?? 'Не выбрано'}</span>
        </span>
        <ChevronDown className="constructed-cards__filter-chevron" size={17} aria-hidden="true" />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className="constructed-cards__filter-menu"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={labelId}
          aria-activedescendant={activeIndex >= 0 ? `${generatedId}-option-${activeIndex}` : undefined}
          onKeyDown={onListKeyDown}
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            const active = index === activeIndex;
            return (
              <li
                key={`${option.value}-${index}`}
                id={`${generatedId}-option-${index}`}
                role="option"
                aria-selected={selected}
                aria-disabled={option.disabled || undefined}
                data-active={active || undefined}
                data-option-index={index}
                onPointerMove={() => !option.disabled && setActiveIndex(index)}
                onPointerDown={event => event.preventDefault()}
                onClick={() => selectIndex(index)}
              >
                <span className="constructed-cards__filter-option-icon">
                  {option.icon && <img src={option.icon} alt={option.iconAlt ?? ''} />}
                </span>
                <span>{option.label}</span>
                <Check className="constructed-cards__filter-check" size={17} aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
