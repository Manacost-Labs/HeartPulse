'use client';

import { useRef, useState } from 'react';
import { useLayoutEffect } from '../primitives/react-compat';

/**
 * Tracks the content width of a wrapper element with ResizeObserver, so charts
 * render at their real pixel size (crisp 1px grid lines, readable text) instead of
 * scaling a fixed viewBox. Height comes from props.
 *
 * Once measured, a width of 0 (the element hidden for a moment, or a full-page capture
 * relaying the page out) keeps the last real width: the chart would otherwise drop its SVG,
 * build a new one and replay its entrance.
 */
export function useChartSize<E extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<E>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (next: number) => setWidth((prev) => (next > 0 || prev === 0 ? next : prev));
    // Measure synchronously before paint so the first frame is already laid out.
    update(Math.floor(el.clientWidth));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => update(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
