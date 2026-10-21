'use client';

import { useCallback, useSyncExternalStore } from 'react';

/*
 * Shared clocks for live relative times ("2 min ago"), countdowns and the like.
 * Every subscriber of one interval shares a single timer, which runs only while
 * someone is subscribed and catches up as soon as a background tab is visible again.
 */

interface Clock {
  now: number;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
  onVisible: () => void;
}

const clocks = new Map<number, Clock>();

function clockFor(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    const created: Clock = {
      now: Date.now(),
      listeners: new Set(),
      // Background tabs throttle timers; catch up as soon as the page is visible again.
      onVisible: () => {
        if (document.visibilityState === 'visible') tick(created);
      },
    };
    clock = created;
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function tick(clock: Clock) {
  clock.now = Date.now();
  clock.listeners.forEach((listener) => listener());
}

/** Joins the clock of `intervalMs`; its single timer runs only while it has subscribers. */
export function subscribeNow(intervalMs: number, listener: () => void) {
  const clock = clockFor(intervalMs);
  clock.listeners.add(listener);
  if (clock.listeners.size === 1) {
    clock.now = Date.now();
    clock.timer = setInterval(() => tick(clock), intervalMs);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', clock.onVisible);
  }
  return () => {
    clock.listeners.delete(listener);
    if (clock.listeners.size === 0 && clock.timer !== undefined) {
      clearInterval(clock.timer);
      clock.timer = undefined;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', clock.onVisible);
    }
  };
}

/** Current time of the `intervalMs` clock. While idle it is refreshed on read, but stays stable within a render pass. */
export function getNow(intervalMs: number) {
  const clock = clockFor(intervalMs);
  // abs: a system clock set backwards must refresh too.
  if (clock.timer === undefined && Math.abs(Date.now() - clock.now) >= 1000) clock.now = Date.now();
  return clock.now;
}

/**
 * The current time (ms), re-rendering the caller every `intervalMs` from a timer shared with
 * every other caller of the same interval. Server renders read the time once.
 */
export function useNow(intervalMs = 60_000) {
  // Stable per interval: a new subscribe function would resubscribe (and restart the timer) on every render.
  const subscribe = useCallback((listener: () => void) => subscribeNow(intervalMs, listener), [intervalMs]);
  const read = () => getNow(intervalMs);
  return useSyncExternalStore(subscribe, read, read);
}
