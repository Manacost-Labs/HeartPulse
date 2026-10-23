import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '../shared/ui/motionTokens';

/**
 * The fade of an overlay that styles its own transition from `shown`: it turns
 * true on the frame after mounting, so the entrance transitions, and `close`
 * turns it false and calls `onClose` once the exit has played (`durationMs`,
 * at once under reduced motion). Without the wait the overlay vanished in one
 * frame on close. Calls while closing are ignored, so a double tap cannot cut
 * the fade short.
 */
export function useOverlayFade(onClose: () => void, durationMs: number) {
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
    const timer = window.setTimeout(() => onCloseRef.current(), prefersReducedMotion() ? 0 : durationMs);
    return () => window.clearTimeout(timer);
  }, [closing, durationMs]);

  const close = useCallback(() => setClosing(true), []);
  return { shown: entered && !closing, close };
}
