'use client';

import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type Ref } from 'react';
import { cx, mergeRefs } from './utils';

type AnyProps = Record<string, unknown>;

/** Merges slot props into child props: handlers chained (child first), classes joined, refs merged. */
export function mergeProps(slotProps: AnyProps, childProps: AnyProps): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps };
  for (const key of Object.keys(slotProps)) {
    const ours = slotProps[key];
    const theirs = childProps[key];
    if (/^on[A-Z]/.test(key) && typeof ours === 'function' && typeof theirs === 'function') {
      merged[key] = (event: { defaultPrevented?: boolean }, ...args: unknown[]) => {
        theirs(event, ...args);
        if (!event?.defaultPrevented) ours(event, ...args);
      };
    }
  }
  if (slotProps.className || childProps.className) {
    merged.className = cx(slotProps.className as string, childProps.className as string);
  }
  if (slotProps.style || childProps.style) {
    merged.style = { ...(slotProps.style as CSSProperties), ...(childProps.style as CSSProperties) };
  }
  if (slotProps.ref || childProps.ref) {
    merged.ref = mergeRefs(slotProps.ref as Ref<unknown>, childProps.ref as Ref<unknown>);
  }
  return merged;
}

export interface SlotProps extends AnyProps {
  children?: ReactElement;
}

/**
 * Renders its single child with the slot's props merged in.
 * Lets components accept any trigger element: `<Tooltip content="…"><Button/></Tooltip>`.
 */
export function Slot({ children, ...props }: SlotProps) {
  if (!isValidElement(children)) return null;
  return cloneElement(children, mergeProps(props, children.props as AnyProps));
}
