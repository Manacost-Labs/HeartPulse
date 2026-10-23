'use client';

import { useRef, useState, type Ref, type RefObject } from 'react';
import { mergeProps } from './Slot';
import { mergeRefs } from './utils';

/*
 * Prop getters of the headless component hooks (useAccordion, useTreeView, useDataTable): `getTriggerProps(item,
 * props)` returns what the element needs (role, ARIA, ids, data-state, handlers, ref) merged with the caller's
 * props the way Slot merges them: the caller's handler runs first and `preventDefault()` skips ours, classes
 * join, styles and refs merge. Getters read no DOM while rendering, so the server and the first client render agree.
 */

/** Props a getter takes from the caller and merges into its own. */
export type UserProps = Record<string, unknown>;

/**
 * `ours` merged with the caller's props. A prop the caller leaves undefined (`onKeyDown` passed on unset) keeps
 * ours; our ref stays the same function when the caller passes none.
 */
export function withUserProps<T extends object>(ours: T, theirs?: UserProps): T {
  if (!theirs) return ours;
  const { ref: theirRef, ...given } = theirs as { ref?: Ref<unknown> };
  const rest: UserProps = {};
  for (const key of Object.keys(given)) if ((given as UserProps)[key] !== undefined) rest[key] = (given as UserProps)[key];
  const { ref: ourRef, ...own } = ours as { ref?: Ref<unknown> };
  const merged = mergeProps(own, rest);
  const ref = ourRef && theirRef ? mergeRefs(ourRef, theirRef) : (ourRef ?? theirRef);
  if (ref) merged.ref = ref;
  return merged as T;
}

/**
 * The id of a part for one item: `base-part-value`, with every character an id reference cannot hold (a space
 * splits `aria-controls`) escaped one-to-one, so two values never share an id.
 */
export function partId(base: string, part: string, value: string): string {
  return `${base}-${part}-${value.replace(/[^A-Za-z0-9-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`)}`;
}

/** The elements in document order (a ref map fills in mount order). */
export function inDocumentOrder<E extends Element>(elements: Iterable<E>): E[] {
  // 4 = DOCUMENT_POSITION_FOLLOWING: b comes after a.
  return [...elements].sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & 4 ? -1 : 1));
}

/**
 * An object ref and a stable callback that fills it. Getters hand out the callback: any element type accepts it
 * (`(node: HTMLElement | null) => void` fits a `<div>` and a `<button>`), and it stays the same between renders.
 */
export function useNodeRef<E extends Element = HTMLElement>(): [RefObject<E | null>, (node: E | null) => void] {
  const ref = useRef<E | null>(null);
  const [setRef] = useState(() => (node: E | null) => {
    ref.current = node;
  });
  return [ref, setRef];
}
