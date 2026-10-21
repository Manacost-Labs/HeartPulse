import { useLayoutEffect, type RefObject } from 'react';
import { motionEasing, motionMs, prefersReducedMotion } from '../../shared/ui/motionTokens';
import { transitionPresetsNow } from './lazyTransitionPresets';

/**
 * A modal panel docked by its layout (a phone bottom sheet, a side drawer)
 * enters with the ValyroUI sheet or cover once on mount, instead of its CSS
 * entrance (`data-modal-surface-entrance` turns that off). Waits for nothing:
 * before the preset engine has loaded at idle the CSS entrance plays.
 */
export function useDockedPanelEntrance(panelRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const presets = transitionPresetsNow();
    if (!presets || !panel?.animate || prefersReducedMotion()) return undefined;
    const preset = presets.modalEntrancePreset(panel.getBoundingClientRect(), window.innerWidth, window.innerHeight);
    const duration = motionMs('--motion-base');
    if (!preset || !duration) return undefined;
    panel.dataset.modalSurfaceEntrance = preset;
    const entrance = panel.animate(presets.entranceKeyframes(preset), { duration, easing: motionEasing('--motion-ease') });
    return () => entrance.cancel();
  }, [panelRef]);
}
