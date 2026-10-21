'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useLatest } from './utils';

export type DismissReason = 'escape' | 'outside';

export interface Layer {
  inside: () => (Element | null)[];
  onEscape?: () => void;
  onOutside?: () => void;
  /** Ignored by outside presses entirely, so it never shields the layers below. */
  passThrough?: boolean;
}

/*
 * Global stack of open layers (menus, popovers, dialogs). Escape closes only
 * the topmost layer; an outside press closes layers from the top down until it
 * reaches a layer that contains the target or one that ignores outside presses.
 * Pass-through layers (tooltips) are skipped by outside presses.
 */
const layers: Layer[] = [];

/**
 * Presses inside an element with this attribute never dismiss any layer —
 * for non-modal regions that float above everything, such as toasts.
 */
export const DISMISS_IGNORE_ATTRIBUTE = 'data-ui-dismiss-ignore';

/** True when `target` (element or text node) sits inside a `[data-ui-dismiss-ignore]` region. */
export function isInDismissIgnoredRegion(target: Node | null): boolean {
  const element = target && (target.nodeType === 1 ? (target as Element) : target.parentElement);
  return !!element?.closest(`[${DISMISS_IGNORE_ATTRIBUTE}]`);
}

function handleKeyDown(event: KeyboardEvent) {
  // Escape during IME composition cancels the conversion, not the layer.
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
  const top = layers[layers.length - 1];
  if (!top?.onEscape) return;
  event.preventDefault();
  top.onEscape();
}

/** Layers (topmost first) that a press on `target` dismisses. */
export function getOutsideDismissals(stack: readonly Layer[], target: Node): Layer[] {
  const result: Layer[] = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const layer = stack[i];
    if (layer.passThrough) continue;
    if (layer.inside().some((el) => el?.contains(target))) break;
    if (!layer.onOutside) break;
    result.push(layer);
  }
  return result;
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node | null;
  if (!target || isInDismissIgnoredRegion(target)) return;
  for (const layer of getOutsideDismissals(layers, target)) layer.onOutside?.();
}

function register(layer: Layer) {
  if (layers.length === 0) {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown, true);
  }
  layers.push(layer);
  return () => {
    const index = layers.indexOf(layer);
    if (index !== -1) layers.splice(index, 1);
    if (layers.length === 0) {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    }
  };
}

export interface DismissableLayerOptions {
  enabled: boolean;
  /** Elements that count as "inside" — usually the trigger and the floating content. */
  refs: RefObject<Element | null>[];
  onDismiss: (reason: DismissReason) => void;
  closeOnEscape?: boolean;
  closeOnOutside?: boolean;
  /**
   * Outside presses go straight to the layers below, as if this layer were not
   * open (non-modal hints such as tooltips). Escape still closes it first.
   */
  passThrough?: boolean;
}

export function useDismissableLayer({
  enabled,
  refs,
  onDismiss,
  closeOnEscape = true,
  closeOnOutside = true,
  passThrough = false,
}: DismissableLayerOptions) {
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const onDismissRef = useLatest(onDismiss);

  useEffect(() => {
    if (!enabled) return;
    return register({
      inside: () => refsRef.current.map((r) => r.current),
      onEscape: closeOnEscape ? () => onDismissRef.current('escape') : undefined,
      onOutside: closeOnOutside ? () => onDismissRef.current('outside') : undefined,
      passThrough,
    });
  }, [enabled, closeOnEscape, closeOnOutside, passThrough, onDismissRef]);
}
