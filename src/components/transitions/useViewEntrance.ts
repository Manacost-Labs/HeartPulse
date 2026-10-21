import { useLayoutEffect, useRef, type Key, type RefObject } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { transitionPresetsNow } from './lazyTransitionPresets';
import type { SiteTransitionPreset } from './transitionPresets';

const FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];

/**
 * The entering half of a ValyroUI preset on the element in the returned ref
 * whenever `viewKey` changes (Галерея ↔ Таблица): the old view is already gone,
 * the new one zooms and fades in over `--motion-base`. The light alternative
 * to `ViewSwitch` where the leaving view need not stay on screen; it adds no
 * preset engine to the page (`lazyTransitionPresets`, a plain fade until then).
 * Never on the first render; reduced motion: a fade.
 */
export function useViewEntrance<T extends HTMLElement>(viewKey: Key, preset: SiteTransitionPreset = 'fade-through'): RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const shown = useRef(viewKey);
  useLayoutEffect(() => {
    const element = ref.current;
    if (shown.current === viewKey) return undefined;
    shown.current = viewKey;
    const duration = motionMs('--motion-base');
    if (!element?.animate || !duration) return undefined;
    const reduced = prefersReducedMotion();
    const keyframes = transitionPresetsNow()?.entranceKeyframes(preset, 'forward', reduced) ?? FADE;
    const entrance = element.animate(keyframes, { duration, easing: motionEasing('--motion-ease') });
    return () => entrance.cancel();
  }, [viewKey, preset]);
  return ref;
}
