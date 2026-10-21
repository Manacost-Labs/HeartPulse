'use client';

import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';
import { clamp, getDirection } from './utils';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';
export type Placement = Side | `${Side}-${Align}`;

/** Anything with a bounding rect — a DOM element or a virtual point (context menus). */
export interface VirtualElement {
  getBoundingClientRect(): DOMRect;
}

export interface Rect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PositionInput {
  anchor: Rect;
  floating: { width: number; height: number };
  viewport: { width: number; height: number };
  placement: Placement;
  offset: number;
  padding: number;
  /** Right-to-left layout: start/end along a top or bottom side mean the right/left edge. */
  rtl?: boolean;
}

export interface PositionResult {
  x: number;
  y: number;
  side: Side;
  align: Align;
  /** Anchor center relative to the floating element's top-left corner — where an arrow should point. */
  arrowX: number;
  arrowY: number;
  /** Room for the floating element on the chosen side (main axis) and across the viewport (cross axis). */
  availableWidth: number;
  availableHeight: number;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const PERPENDICULAR: Record<Side, [Side, Side]> = {
  top: ['left', 'right'],
  bottom: ['left', 'right'],
  left: ['bottom', 'top'],
  right: ['bottom', 'top'],
};

export function parsePlacement(placement: Placement): [Side, Align] {
  const [side, align = 'center'] = placement.split('-') as [Side, Align?];
  return [side, align];
}

/**
 * Pure positioning: flips to the opposite side when needed — or, when neither
 * fits, to a perpendicular side that does (a "right" popover on a phone drops
 * below) — then shifts into the viewport, but never so far that it detaches
 * from the anchor, so a popover scrolls away with its anchor instead of
 * sticking to the viewport edge.
 */
export function computePosition({
  anchor: a,
  floating: f,
  viewport: vp,
  placement,
  offset,
  padding,
  rtl = false,
}: PositionInput): PositionResult {
  const [preferred, logicalAlign] = parsePlacement(placement);

  const space: Record<Side, number> = {
    top: a.top - padding,
    bottom: vp.height - a.bottom - padding,
    left: a.left - padding,
    right: vp.width - a.right - padding,
  };
  const need = (s: Side) => (s === 'top' || s === 'bottom' ? f.height : f.width) + offset;

  const fits = (s: Side) => space[s] >= need(s);
  let side = preferred;
  if (!fits(side)) {
    const [p1, p2] = PERPENDICULAR[side];
    const roomier = space[p1] >= space[p2] ? p1 : p2;
    if (fits(OPPOSITE[side])) side = OPPOSITE[side];
    else if (fits(roomier)) side = roomier;
    else if (space[OPPOSITE[side]] > space[side]) side = OPPOSITE[side];
  }

  // Resolved after any flip, so a "right-start" submenu that drops below a narrow screen aligns to the right in RTL too.
  const mirrored = rtl && (side === 'top' || side === 'bottom') && logicalAlign !== 'center';
  const align: Align = mirrored ? (logicalAlign === 'start' ? 'end' : 'start') : logicalAlign;
  let x: number;
  let y: number;
  if (side === 'top' || side === 'bottom') {
    y = side === 'bottom' ? a.bottom + offset : a.top - offset - f.height;
    x = align === 'start' ? a.left : align === 'end' ? a.right - f.width : a.left + a.width / 2 - f.width / 2;
  } else {
    x = side === 'right' ? a.right + offset : a.left - offset - f.width;
    y = align === 'start' ? a.top : align === 'end' ? a.bottom - f.height : a.top + a.height / 2 - f.height / 2;
  }
  // Into the viewport first, then back within reach of the anchor (the anchor wins when it is off-screen).
  x = clamp(x, padding, Math.max(padding, vp.width - padding - f.width));
  y = clamp(y, padding, Math.max(padding, vp.height - padding - f.height));
  x = clamp(x, a.left - offset - f.width, a.right + offset);
  y = clamp(y, a.top - offset - f.height, a.bottom + offset);
  x = Math.round(x);
  y = Math.round(y);
  const vertical = side === 'top' || side === 'bottom';
  return {
    x,
    y,
    side,
    align,
    arrowX: Math.round(a.left + a.width / 2 - x),
    arrowY: Math.round(a.top + a.height / 2 - y),
    availableWidth: Math.max(0, Math.floor(vertical ? vp.width - 2 * padding : space[side] - offset)),
    availableHeight: Math.max(0, Math.floor(vertical ? space[side] - offset : vp.height - 2 * padding)),
  };
}

const ORIGIN: Record<Side, Record<Align, string>> = {
  bottom: { start: 'top left', center: 'top center', end: 'top right' },
  top: { start: 'bottom left', center: 'bottom center', end: 'bottom right' },
  right: { start: 'top left', center: 'center left', end: 'bottom left' },
  left: { start: 'top right', center: 'center right', end: 'bottom right' },
};

/**
 * Where the enter animation grows from: the point on the panel's near edge facing the anchor's centre,
 * so a menu under a small trigger, or a panel shifted away from a viewport edge, still grows out of its
 * trigger. When the anchor's centre is past the panel's extent (an anchor much wider than the panel),
 * the corner for side and align.
 */
export function floatingOrigin(position: Pick<PositionResult, 'side' | 'align' | 'arrowX' | 'arrowY'>, size: { width: number; height: number }) {
  const { side, align, arrowX, arrowY } = position;
  if (side === 'top' || side === 'bottom') {
    return arrowX >= 0 && arrowX <= size.width ? `${arrowX}px ${side === 'bottom' ? 'top' : 'bottom'}` : ORIGIN[side][align];
  }
  return arrowY >= 0 && arrowY <= size.height ? `${side === 'right' ? 'left' : 'right'} ${arrowY}px` : ORIGIN[side][align];
}

export interface UseFloatingOptions {
  open: boolean;
  anchorRef: RefObject<Element | VirtualElement | null>;
  floatingRef: RefObject<HTMLElement | null>;
  placement?: Placement;
  offset?: number;
  /** Minimum distance to the viewport edge. */
  padding?: number;
  /** Floating element is at least as wide as the anchor (selects, comboboxes). */
  matchAnchorWidth?: boolean;
}

/** Positions `floatingRef` (position: fixed) next to `anchorRef` and keeps it there on scroll/resize. */
export function useFloating({
  open,
  anchorRef,
  floatingRef,
  placement = 'bottom',
  offset = 8,
  padding = 8,
  matchAnchorWidth = false,
}: UseFloatingOptions) {
  const [position, setPosition] = useState<
    (PositionResult & { anchorWidth: number; floatingWidth: number; floatingHeight: number }) | null
  >(null);

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    const floating = floatingRef.current;
    if (!anchor || !floating) return;
    const a = anchor.getBoundingClientRect();
    if (matchAnchorWidth) floating.style.minWidth = `${a.width}px`;
    // offsetWidth ignores the transform applied by the enter animation.
    const size = { width: floating.offsetWidth, height: floating.offsetHeight };
    const next = computePosition({
      anchor: a,
      floating: size,
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      placement,
      rtl: getDirection(floating) === 'rtl',
      offset,
      padding,
    });
    setPosition((prev) =>
      prev &&
      prev.x === next.x &&
      prev.y === next.y &&
      prev.side === next.side &&
      prev.align === next.align &&
      prev.arrowX === next.arrowX &&
      prev.arrowY === next.arrowY &&
      prev.availableWidth === next.availableWidth &&
      prev.availableHeight === next.availableHeight &&
      prev.anchorWidth === a.width &&
      prev.floatingWidth === size.width &&
      prev.floatingHeight === size.height
        ? prev
        : { ...next, anchorWidth: a.width, floatingWidth: size.width, floatingHeight: size.height },
    );
  }, [anchorRef, floatingRef, placement, offset, padding, matchAnchorWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { capture: true, passive: true });
    const observer = new ResizeObserver(update);
    const anchor = anchorRef.current;
    if (anchor instanceof Element) observer.observe(anchor);
    if (floatingRef.current) observer.observe(floatingRef.current);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, { capture: true });
      observer.disconnect();
    };
  }, [open, update, anchorRef, floatingRef]);

  const [prefSide, prefAlign] = parsePlacement(placement);
  const side = position?.side ?? prefSide;
  const align = position?.align ?? prefAlign;

  const floatingStyles: CSSProperties = {
    position: 'fixed',
    top: position?.y ?? 0,
    left: position?.x ?? 0,
    // Not yet positioned: invisible but still focusable, so callers can focus content in the
    // same commit that opens it (visibility: hidden would block focus).
    opacity: position ? undefined : 0,
    pointerEvents: position ? undefined : 'none',
    ['--ui-transform-origin' as string]: position
      ? floatingOrigin(position, { width: position.floatingWidth, height: position.floatingHeight })
      : ORIGIN[side][align],
    ['--ui-anchor-width' as string]: position ? `${position.anchorWidth}px` : undefined,
    ['--ui-arrow-x' as string]: position ? `${position.arrowX}px` : undefined,
    ['--ui-arrow-y' as string]: position ? `${position.arrowY}px` : undefined,
    // For capping tall panels: `max-height: var(--ui-available-height)`.
    ['--ui-available-width' as string]: position ? `${position.availableWidth}px` : undefined,
    ['--ui-available-height' as string]: position ? `${position.availableHeight}px` : undefined,
  };

  return { floatingStyles, side, align, update };
}
