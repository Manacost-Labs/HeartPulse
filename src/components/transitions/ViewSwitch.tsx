'use client';
import { type Key, type ReactNode } from 'react';
import { PageTransition } from '../../vendor/valyro-ui/motion-kit/PageTransition';
import { motionMs } from '../../shared/ui/motionTokens';
import type { SiteTransitionPreset } from './transitionPresets';
import { useSwitchDirection, type TransitionDirection } from './transitionOrder';
import './ViewSwitch.css';

let switchMs: number | undefined;

/** `--motion-base`, read once: a render must not force a style recalculation. */
function switchDuration(): number | undefined {
  if (typeof document === 'undefined') return undefined;
  switchMs ??= motionMs('--motion-base') || 220;
  return switchMs;
}

export interface ViewSwitchProps {
  /** The view shown: a tab id, a mode. A new key plays the change; the first render never moves. */
  viewKey: Key;
  /** Only presets whose views cross through opacity 0: the two never show at once. */
  preset?: Extract<SiteTransitionPreset, 'fade-through' | 'shared-x' | 'shared-y' | 'shared-z'>;
  /** The order of the buttons that pick `viewKey` (tabs, modes): a later one plays forward, an earlier one back. */
  order?: readonly Key[];
  /** forward — the tab to the right, the next mode; back — the other way. Ignored with `order`. */
  direction?: TransitionDirection;
  className?: string;
  children: ReactNode;
}

/**
 * Changes between views of one page (tabs, modes) with a ValyroUI preset at
 * the site's `--motion-base` tempo. The view that leaves stays mounted, inert
 * and hidden from assistive technology, while it fades out; the new one
 * mounts fresh. Server markup and the first paint are the plain view: only a
 * changed `viewKey` animates, so SSR content never moves on load. Reduced
 * motion: the old view goes at once and the new one fades in. The GPU tier is fixed: every preset here moves only
 * opacity and a short transform, and detecting a software renderer would cost a
 * WebGL context on each page.
 */
export function ViewSwitch({ viewKey, preset = 'shared-x', order, direction = 'forward', className, children }: ViewSwitchProps) {
  const ordered = useSwitchDirection(viewKey, order ?? []);
  return <PageTransition pageKey={viewKey} preset={preset} direction={order ? ordered : direction} duration={switchDuration()} tier="gpu"
    className={className ? `view-switch ${className}` : 'view-switch'}>
    {children}
  </PageTransition>;
}
