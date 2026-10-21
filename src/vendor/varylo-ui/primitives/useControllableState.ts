'use client';

import { useCallback, useState, type SetStateAction } from 'react';
import { useLatest } from './utils';

interface Options<T> {
  value?: T;
  defaultValue: T;
  onChange?: (value: T) => void;
}

/**
 * State that works both controlled (`value` + `onChange`) and uncontrolled
 * (`defaultValue`). Used for every value/open prop in the library.
 */
export function useControllableState<T>({ value, defaultValue, onChange }: Options<T>) {
  const [inner, setInner] = useState(defaultValue);
  const isControlled = value !== undefined;
  const current = isControlled ? value : inner;
  const currentRef = useLatest(current);
  const onChangeRef = useLatest(onChange);

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(currentRef.current) : next;
      if (Object.is(resolved, currentRef.current)) return;
      if (!isControlled) {
        // Like useState: a second updater in the same event builds on this value, not on the last render.
        // Controlled values are left alone: the parent may refuse the change.
        currentRef.current = resolved;
        setInner(resolved);
      }
      onChangeRef.current?.(resolved);
    },
    [isControlled, currentRef, onChangeRef],
  );

  return [current, setValue] as const;
}
