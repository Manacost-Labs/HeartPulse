'use client';

import { useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { useControllableState } from '../primitives/useControllableState';
import { stepIndex } from '../primitives/useListNavigation';
import { getDirection, inlineArrowStep } from '../primitives/utils';
import { useId } from '../primitives/react-compat';
import { partId, useNodeRef, withUserProps, type UserProps } from '../primitives/prop-getters';
import { useFormReset } from './form-reset';

/*
 * The behaviour of RadioGroup and SegmentedControl without their markup: the checked value (controlled or not) of a
 * `radiogroup`, with either kind of radio. Native `<input type="radio">` (getInputProps) move with the browser's own
 * arrow keys; any other element (getRadioProps: a button with role radio) gets a roving tab stop and the WAI-ARIA
 * radio keys from the group: every arrow (← / → mirrored under RTL), Home and End, skipping disabled radios, and
 * the radio that takes focus is checked. A form reset brings an uncontrolled value back to its default.
 */

export interface RadioGroupOptions {
  /** The radios in order: their values, and which are disabled. */
  items: RadioDescriptor[];
  /** The checked value; an empty string means none. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Disables every radio. */
  disabled?: boolean;
  /** A choice is mandatory: aria-required on the group, `required` on native radios. */
  required?: boolean;
  /** aria-invalid on the group. */
  invalid?: boolean;
  /** Name of the native radios. Default: generated. */
  name?: string;
  /** aria-orientation of the group (the keys work on both axes either way). */
  orientation?: 'horizontal' | 'vertical';
  /** An uncontrolled value goes back to `defaultValue` when the surrounding form resets. Default true. */
  formReset?: boolean;
}

/** A radio, as the getters see it. */
export interface RadioDescriptor {
  value: string;
  disabled?: boolean;
}

type RadioState = { 'data-state': 'checked' | 'unchecked' };

export interface RadioGroupState {
  value: string;
  setValue: (value: string) => void;
  isChecked: (value: string) => boolean;
  /** The `role="radiogroup"` element; name it with `aria-label` or `aria-labelledby`. */
  getGroupProps: (props?: UserProps) => HTMLAttributes<HTMLElement> & { ref: (node: HTMLElement | null) => void };
  /** A native `<input type="radio">`. */
  getInputProps: (item: RadioDescriptor, props?: UserProps) => InputHTMLAttributes<HTMLInputElement> & RadioState;
  /** A radio that is not native: a `<button>` with role radio, on the roving tab stop. */
  getRadioProps: (item: RadioDescriptor, props?: UserProps) => ButtonHTMLAttributes<HTMLButtonElement> &
    RadioState & { ref: (node: HTMLButtonElement | null) => void };
  /** An id for the description of the radio with `value` (its `aria-describedby`). */
  getDescriptionId: (value: string) => string;
}

export function useRadioGroup({
  items,
  value: valueProp,
  defaultValue = '',
  onValueChange,
  disabled = false,
  required,
  invalid = false,
  name,
  orientation,
  formReset = true,
}: RadioGroupOptions): RadioGroupState {
  const [value, setValue] = useControllableState({ value: valueProp, defaultValue, onChange: onValueChange });
  const baseId = useId();
  const [groupRef, setGroupNode] = useNodeRef();
  // A form reset brings the uncontrolled value back to its default (forms/form-reset.ts).
  useFormReset(groupRef, () => setValue(defaultValue), formReset && valueProp === undefined);
  const nodes = useRef(new Map<string, HTMLButtonElement>());
  // One ref callback per radio, so a radio's ref does not change on every render.
  const refs = useRef(new Map<string, (node: HTMLButtonElement | null) => void>());
  const radioRef = (radioValue: string) => {
    let ref = refs.current.get(radioValue);
    if (!ref) {
      ref = (node) => {
        if (node) nodes.current.set(radioValue, node);
        else nodes.current.delete(radioValue);
      };
      refs.current.set(radioValue, ref);
    }
    return ref;
  };

  const isDisabled = (index: number) => disabled || !!items[index]?.disabled;
  const checkedIndex = items.findIndex((item) => item.value === value);
  // Reachable by Tab even when the value matches no radio or a disabled one.
  const focusableIndex = checkedIndex >= 0 && !isDisabled(checkedIndex) ? checkedIndex : items.findIndex((_, i) => !isDisabled(i));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) return;
    // Only the radios of getRadioProps: native radios have their own arrow keys.
    const from = items.findIndex((item) => nodes.current.get(item.value) === event.target);
    if (from < 0) return;
    const count = items.length;
    const inline = inlineArrowStep(event.key, getDirection(event.currentTarget as Element));
    const step = inline || (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0);
    const next =
      step !== 0
        ? stepIndex(count, from, step, isDisabled)
        : event.key === 'Home'
          ? stepIndex(count, -1, 1, isDisabled)
          : event.key === 'End'
            ? stepIndex(count, count, -1, isDisabled)
            : -1;
    if (next < 0) return;
    event.preventDefault();
    nodes.current.get(items[next].value)?.focus();
    // Radio groups select on focus.
    setValue(items[next].value);
  };

  const state = (item: RadioDescriptor): RadioState => ({ 'data-state': item.value === value ? 'checked' : 'unchecked' });

  return {
    value,
    setValue,
    isChecked: (radioValue) => radioValue === value,
    getGroupProps: (props) =>
      withUserProps(
        {
          ref: setGroupNode,
          role: 'radiogroup',
          'aria-orientation': orientation,
          'aria-disabled': disabled || undefined,
          'aria-invalid': invalid || undefined,
          'aria-required': required || undefined,
          onKeyDown,
        },
        props,
      ) as never,
    getInputProps: (item, props) =>
      withUserProps(
        {
          type: 'radio',
          name: name ?? baseId,
          value: item.value,
          checked: item.value === value,
          disabled: disabled || item.disabled,
          required,
          ...state(item),
          onChange: () => setValue(item.value),
        },
        props,
      ) as never,
    getRadioProps: (item, props) => {
      const index = items.findIndex((i) => i.value === item.value);
      return withUserProps(
        {
          ref: radioRef(item.value),
          type: 'button',
          role: 'radio',
          'aria-checked': item.value === value,
          tabIndex: index === focusableIndex ? 0 : -1,
          disabled: disabled || item.disabled,
          ...state(item),
          onClick: () => setValue(item.value),
        },
        props,
      ) as never;
    },
    getDescriptionId: (radioValue) => partId(baseId, 'description', radioValue),
  };
}
