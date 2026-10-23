import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The fade of an overlay that styles its own opacity transition from `shown`:
 * it turns true on the frame after mounting, so the entrance transitions, and
 * `close` turns it false and calls `onClose` when the overlay's (`ref`) opacity
 * transition ends. The transition starts only on the next rendered frame,
 * which a busy page delays, so a timer started at `close` could unmount the
 * overlay mid-fade; `fallbackMs` only covers a transition that never runs (no
 * element, nothing to fade). Reduced motion shortens the transition globally
 * (index.css), so the close follows at once. Calls while closing are ignored,
 * so a double tap cannot cut the fade short.
 */
export function useOverlayFade<T extends HTMLElement>(onClose: () => void, fallbackMs: number) {
  const ref = useRef<T | null>(null);
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!closing) return undefined;
    const element = ref.current;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onCloseRef.current();
    };
    // The entrance's end event may still be queued when a quick close starts.
    const ended = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === 'opacity' && getComputedStyle(element).opacity === '0') finish();
    };
    element?.addEventListener('transitionend', ended);
    const timer = window.setTimeout(finish, fallbackMs);
    return () => {
      window.clearTimeout(timer);
      element?.removeEventListener('transitionend', ended);
    };
  }, [closing, fallbackMs]);

  const close = useCallback(() => setClosing(true), []);
  return { ref, shown: entered && !closing, close };
}
