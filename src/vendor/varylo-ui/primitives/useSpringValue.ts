'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { SPRINGS, stepSpring, themeSlowMs, type SpringName, type SpringOptions, type SpringValue } from './spring';
import { useLatest } from './utils';

export interface SpringValueOptions {
  /** A named spring or explicit stiffness / damping (default `snappy`). */
  spring?: SpringName | SpringOptions;
  /** Element whose theme sets the tempo (`--ui-duration-slow`); without it the reference tempo is used. */
  tempoRef?: RefObject<Element | null>;
  /** Off: every new target is applied at once. */
  enabled?: boolean;
}

/**
 * Springs a number towards `target` and hands each frame's value to `onFrame`, which writes it straight
 * to the DOM (a counter's text, a transform), so React does not render per frame. The first value and
 * every value under reduced motion are applied at once; a new target mid-flight keeps the velocity.
 */
export function useSpringValue(target: number, onFrame: (value: number) => void, options: SpringValueOptions = {}) {
  const { spring = 'snappy', tempoRef, enabled = true } = options;
  const write = useLatest(onFrame);
  const state = useRef<SpringValue | null>(null);
  const frame = useRef(0);
  const springOptions: SpringOptions = typeof spring === 'string' ? SPRINGS[spring] : spring;
  const stiffness = springOptions.stiffness;
  const damping = springOptions.damping;
  const mass = springOptions.mass;

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    if (!state.current || !enabled || reduced) {
      state.current = { value: target, velocity: 0 };
      write.current(target);
      return;
    }
    const current = state.current;
    // A theme with a faster --ui-duration-slow plays the same spring faster.
    const tempo = tempoRef?.current ? 340 / Math.max(1, themeSlowMs(tempoRef.current)) : 1;
    const precision = Math.max(1e-4, Math.abs(target - current.value) * 1e-4);
    let last = 0;
    const run = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) * tempo : (1 / 60) * tempo;
      last = now;
      const done = stepSpring(current, target, dt, { stiffness, damping, mass }, precision);
      write.current(current.value);
      frame.current = done ? 0 : requestAnimationFrame(run);
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(run);
    return () => cancelAnimationFrame(frame.current);
  }, [target, enabled, stiffness, damping, mass, tempoRef, write]);
}
