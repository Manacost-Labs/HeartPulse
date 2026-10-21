'use client';

import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';

/*
 * Compound components (`<Tabs.List><Tabs.Tab/></Tabs.List>`) next to the props API. Collection parts
 * (a tab, an option, a menu row) are read from the children while rendering, so the result is the same
 * as the `items` / `options` props, on the server too. They must be direct children of their parent part
 * (fragments are fine), not wrapped in other components.
 */

/** The elements among `children`, in order, with fragments and arrays flattened. */
export function childElements(children: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) out.push(...childElements((child.props as { children?: ReactNode }).children));
    else out.push(child);
  });
  return out;
}

/** The child elements whose type is `part`. */
export function partsOf<P>(children: ReactNode, part: unknown): ReactElement<P>[] {
  return childElements(children).filter((child): child is ReactElement<P> => child.type === part);
}

/** Whether a child element is one of `parts`. */
export function hasPart(children: ReactNode, parts: readonly unknown[]): boolean {
  return childElements(children).some((child) => parts.includes(child.type));
}

/** The first `part` element anywhere in the element tree of `children` (through their `children` props). */
export function findPart<P>(children: ReactNode, part: unknown): ReactElement<P> | undefined {
  for (const child of childElements(children)) {
    if (child.type === part) return child as ReactElement<P>;
    const found = findPart<P>((child.props as { children?: ReactNode }).children, part);
    if (found) return found;
  }
  return undefined;
}

/**
 * Props of a part whose props go to an element its parent renders, without `children` and `ref` (read the ref
 * with getElementRef: before React 19 it is not a prop).
 */
export function propsOf<P extends object>(element: ReactElement<P> | undefined): Omit<P, 'children' | 'ref'> {
  if (!element) return {} as Omit<P, 'children' | 'ref'>;
  // The rest copy skips React 18's non-enumerable `ref` warning getter; React 19's enumerable `ref` is deleted.
  const { children: _children, ...props } = element.props as P & { children?: unknown };
  delete (props as { ref?: unknown }).ref;
  return props as Omit<P, 'children' | 'ref'>;
}

/** Placeholder render of a collection part: its parent reads it, so it renders nothing on its own. */
export function collectionPart<P>(name: string): (props: P) => null {
  const part = (_props: P) => null;
  return Object.assign(part, { displayName: name });
}
