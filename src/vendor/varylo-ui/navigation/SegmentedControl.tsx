'use client';

import { useLayoutEffect, useRef, type ComponentPropsWithRef, type KeyboardEvent, type ReactNode } from 'react';
import { composeHandlers, cx, getDirection, useControllableState } from '../primitives';
import { useFormField } from '../forms-advanced/form-field-context';
import { revealInList, rovingTarget, useOverflowScroll, useSlidingIndicator } from './internal';
import '../primitives/motion.css';
import './SegmentedControl.css';

export interface SegmentedControlOption {
  value: string;
  label?: ReactNode;
  icon?: ReactNode;
  /** Accessible name for icon-only options. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps
  extends Omit<ComponentPropsWithRef<'div'>, 'defaultValue' | 'onChange' | 'children'> {
  /** Segments in order; each shows a label, an icon, or both. */
  options: SegmentedControlOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Control height and text size. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Stretch to the container width with equal segments (a label wider than its share keeps its width).
   * Either way, segments that don't fit scroll sideways with faded edges instead of truncating.
   */
  fullWidth?: boolean;
  /** Error state, e.g. from a FormField: aria-invalid on the group (an explicit `aria-invalid` wins). */
  invalid?: boolean;
  /** `spring`: the thumb springs to the chosen segment with a slight overshoot. `default`: the theme's curve. */
  animation?: 'default' | 'spring';
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  fullWidth = false,
  invalid = false,
  animation = 'default',
  className,
  ref,
  onKeyDown: onKeyDownProp,
  ...rest
}: SegmentedControlProps) {
  const field = useFormField();
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue: defaultValue ?? options.find((option) => !option.disabled)?.value ?? '',
    onChange: onValueChange,
  });
  // Segments and thumb sit in a viewport inside the track, so a scrolling row fades under the track's
  // edges while the track itself (fill, ring, rounded ends) stays whole.
  const listRef = useRef<HTMLDivElement>(null);
  const thumb = useSlidingIndicator(listRef, current);
  useOverflowScroll(listRef, options.length, ':scope > [data-active="true"]');

  // Keeps the selected segment in view when the value changes while the row is scrolled.
  useLayoutEffect(() => {
    const list = listRef.current;
    const segment = list?.querySelector<HTMLElement>(':scope > [data-active="true"]');
    if (list?.getAttribute('data-overflow') === 'true' && segment) revealInList(list, segment);
  }, [current]);

  const isDisabled = (index: number) => !!options[index]?.disabled;
  const selectedIndex = options.findIndex((option) => option.value === current);
  const focusableIndex = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>(':scope > [role="radio"]') ?? []);
    const from = buttons.indexOf(event.target as HTMLButtonElement);
    if (from < 0) return;
    // Radio groups move with both arrow axes and select on focus.
    const next = rovingTarget(event.key, options.length, from, isDisabled, 'both', getDirection(event.currentTarget));
    if (next === null) return;
    event.preventDefault();
    buttons[next]?.focus();
    setCurrent(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      // Inside a FormField its label names the group (a `for` pointing at a div names nothing).
      aria-labelledby={rest['aria-label'] ? undefined : field?.labelId}
      aria-invalid={invalid || undefined}
      {...rest}
      ref={ref}
      className={cx('ui-segmented-control', className)}
      data-size={size}
      data-full-width={fullWidth || undefined}
      data-motion={animation === 'spring' ? 'spring' : undefined}
      onKeyDown={composeHandlers(onKeyDownProp, onKeyDown)}
    >
      <div ref={listRef} className="ui-segmented-control__viewport">
        {options.map((option, index) => {
          const checked = index === selectedIndex;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              title={option.label ? undefined : option.ariaLabel}
              tabIndex={index === focusableIndex ? 0 : -1}
              disabled={option.disabled}
              data-active={checked || undefined}
              className="ui-segmented-control__item"
              onClick={() => setCurrent(option.value)}
            >
              {option.icon && <span className="ui-segmented-control__icon">{option.icon}</span>}
              {option.label != null && <span className="ui-segmented-control__label">{option.label}</span>}
            </button>
          );
        })}
        {thumb && (
          <span
            className="ui-segmented-control__thumb"
            aria-hidden="true"
            style={{ width: thumb.width, transform: `translateX(${thumb.left}px)`, transition: thumb.instant ? 'none' : undefined }}
          />
        )}
      </div>
    </div>
  );
}
