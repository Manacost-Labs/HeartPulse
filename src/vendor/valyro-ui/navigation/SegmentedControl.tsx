'use client';

import { useMemo, useRef, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cx } from '../primitives';
import { collectionPart, partsOf } from '../primitives/compound';
import { useFormField } from '../forms-advanced/form-field-context';
import { useRadioGroup } from '../forms/useRadioGroup';
import { revealInList, useOverflowScroll, useSlidingIndicator } from './internal';
import '../primitives/motion.css';
import './SegmentedControl.css';
import { withRef, useLayoutEffect } from '../primitives/react-compat';

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
  /** Segments in order; each shows a label, an icon, or both. Or compose them as children: `SegmentedControl.Item`. */
  options?: SegmentedControlOption[];
  /** The compound form instead of `options`: `SegmentedControl.Item` elements. */
  children?: ReactNode;
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
  /** Disables every segment, like RadioGroup's `disabled`. */
  disabled?: boolean;
  /** `spring`: the thumb springs to the chosen segment with a slight overshoot. `default`: the theme's curve. */
  animation?: 'default' | 'spring';
}

export interface SegmentedControlItemProps extends Omit<SegmentedControlOption, 'label'> {
  /** The segment's label (leave it out for an icon-only segment with `ariaLabel`). */
  children?: ReactNode;
}

/** A segment of the compound form (`SegmentedControl.Item`): the props of a SegmentedControlOption, label as children. */
export const SegmentedControlItem = collectionPart<SegmentedControlItemProps>('SegmentedControl.Item');

export const SegmentedControl = withRef(function SegmentedControl({
  options: optionsProp,
  children,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  fullWidth = false,
  invalid = false,
  disabled = false,
  animation = 'default',
  className,
  ref,
  ...rest
}: SegmentedControlProps) {
  const options = useMemo(
    () =>
      optionsProp ??
      partsOf<SegmentedControlItemProps>(children, SegmentedControlItem).map(({ props: { children: label, ...option } }) => ({ ...option, label })),
    [optionsProp, children],
  );
  const field = useFormField();
  // The behaviour is useRadioGroup's (valyro-ui/headless): roving tab stop, both arrow axes, selection on focus.
  const radio = useRadioGroup({
    items: options,
    value,
    defaultValue: defaultValue ?? options.find((option) => !option.disabled)?.value ?? '',
    onValueChange,
    disabled,
    invalid,
    // Not a form control: it submits nothing, so a form reset leaves it alone.
    formReset: false,
  });
  const current = radio.value;
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

  return (
    <div
      {...radio.getGroupProps({
        // Inside a FormField its label names the group (a `for` pointing at a div names nothing).
        'aria-labelledby': rest['aria-label'] ? undefined : field?.labelId,
        // FormField's `required` only marks its label (aria-hidden); announce it on the group.
        'aria-required': field?.required || undefined,
        ...rest,
        ref,
        className: cx('ui-segmented-control', className),
        'data-size': size,
        'data-full-width': fullWidth || undefined,
        'data-motion': animation === 'spring' ? 'spring' : undefined,
      })}
    >
      <div ref={listRef} className="ui-segmented-control__viewport">
        {options.map((option) => {
          const checked = option.value === current;
          return (
            <button
              key={option.value}
              {...radio.getRadioProps(option, {
                'aria-label': option.ariaLabel,
                title: option.label ? undefined : option.ariaLabel,
                'data-active': checked || undefined,
                'data-icon-only': option.label == null || undefined,
                className: 'ui-segmented-control__item',
              })}
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
}, { Item: SegmentedControlItem });
