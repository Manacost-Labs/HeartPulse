'use client';

import { useEffect, type RefObject } from 'react';
import { useLatest } from '../primitives/utils';

/**
 * Calls `onReset` with the field after its form was reset. A reset restores the default values without any
 * input or change event, so state mirrored from the value (filled, character count, height) must re-read it,
 * and a custom control (picker, checkbox, slider…) must go back to its `defaultValue` itself.
 * `ref` is any element of the control: a form control's own form, or else the closest <form>.
 * Only for uncontrolled fields (`enabled`): a controlled value is the parent's to restore.
 */
export function useFormReset<E extends Element>(
  ref: RefObject<E | null>,
  onReset: (field: E) => void,
  enabled: boolean,
) {
  const latest = useLatest(onReset);
  useEffect(() => {
    const field = ref.current;
    const form = field && ((field as Partial<HTMLInputElement>).form ?? field.closest('form'));
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
