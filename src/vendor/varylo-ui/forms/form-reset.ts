'use client';

import { useEffect, type RefObject } from 'react';
import { useLatest } from '../primitives';

/**
 * Calls `onReset` with the field after its form was reset. A reset restores the default values without any
 * input or change event, so state mirrored from the value (filled, character count, height) must re-read it.
 * Only for uncontrolled fields (`enabled`): a controlled value is the parent's to restore.
 */
export function useFormReset<E extends HTMLInputElement | HTMLTextAreaElement>(
  ref: RefObject<E | null>,
  onReset: (field: E) => void,
  enabled: boolean,
) {
  const latest = useLatest(onReset);
  useEffect(() => {
    const field = ref.current;
    const form = field?.form;
    if (!enabled || !field || !form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The reset event fires before the fields are restored: read them once that is done.
    const handle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => latest.current(field));
    };
    form.addEventListener('reset', handle);
    return () => {
      form.removeEventListener('reset', handle);
      clearTimeout(timer);
    };
  }, [ref, latest, enabled]);
}
