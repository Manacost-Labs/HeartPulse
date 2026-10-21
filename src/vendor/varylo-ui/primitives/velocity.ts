export interface VelocityTracker {
  /** Forgets every sample (call on pointer down). */
  reset(): void;
  /** Records the pointer position (px) at `time` (ms, e.g. `event.timeStamp`). */
  add(position: number, time: number): void;
  /**
   * Speed in px/ms over the last `windowMs` before the latest sample, positive towards larger
   * positions. 0 when the pointer rested for longer than the window before `now` (no flick).
   */
  velocity(now?: number): number;
}

/** Release velocity of a drag, for flicks and momentum (bottom sheets, wheels, carousels). */
export function createVelocityTracker(windowMs = 100): VelocityTracker {
  let samples: { position: number; time: number }[] = [];
  return {
    reset() {
      samples = [];
    },
    add(position, time) {
      samples.push({ position, time });
      // Only the recent window matters; keep the array short during long drags.
      const cutoff = time - windowMs * 2;
      while (samples.length > 2 && samples[0].time < cutoff) samples.shift();
    },
    velocity(now) {
      const last = samples[samples.length - 1];
      if (!last || (now !== undefined && now - last.time > windowMs)) return 0;
      let first = last;
      for (let i = samples.length - 1; i >= 0 && last.time - samples[i].time <= windowMs; i--) first = samples[i];
      const dt = last.time - first.time;
      return dt > 0 ? (last.position - first.position) / dt : 0;
    },
  };
}
