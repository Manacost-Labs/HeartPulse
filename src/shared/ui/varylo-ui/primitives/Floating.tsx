'use client';

import { useRef, type ComponentPropsWithRef, type ReactNode, type RefObject } from 'react';
import { Portal } from './Portal';
import { useDismissableLayer, type DismissReason } from './useDismissableLayer';
import { useFloating, type Placement, type VirtualElement } from './useFloating';
import { usePresence } from './usePresence';
import { cx, mergeRefs } from './utils';
import './motion.css';

export interface FloatingProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  open: boolean;
  anchorRef: RefObject<Element | VirtualElement | null>;
  placement?: Placement;
  offset?: number;
  matchAnchorWidth?: boolean;
  /** Called on Escape / outside press. Omit to make the layer non-dismissable. */
  onDismiss?: (reason: DismissReason) => void;
  closeOnOutside?: boolean;
  closeOnEscape?: boolean;
  /** Extra elements treated as "inside" for outside-press detection. The anchor is included automatically. */
  insideRefs?: RefObject<Element | null>[];
  /** Apply the shared `.ui-floating` material (default true). */
  surface?: boolean;
  /** Enter/exit: `pop` (the theme's), `fade`, `spring` (springs out of the anchor's side) or `none`. */
  animation?: 'pop' | 'fade' | 'spring' | 'none';
  children: ReactNode;
}

/**
 * Portal + positioning + dismissal + enter/exit animation.
 * The building block for popovers, menus, selects, tooltips and pickers.
 */
export function Floating({
  open,
  anchorRef,
  placement = 'bottom',
  offset = 8,
  matchAnchorWidth,
  onDismiss,
  closeOnOutside = true,
  closeOnEscape = true,
  insideRefs = [],
  surface = true,
  animation = 'pop',
  className,
  style,
  ref,
  children,
  ...rest
}: FloatingProps) {
  // Exit animations use --ui-duration-fast (≤ 160ms); keep a margin so the last frame is not cut.
  const { isMounted, state } = usePresence(open, 200);
  if (!isMounted) return null;
  return (
    <Portal>
      <FloatingContent
        {...rest}
        ref={ref}
        open={open}
        state={state}
        anchorRef={anchorRef}
        placement={placement}
        offset={offset}
        matchAnchorWidth={matchAnchorWidth}
        onDismiss={onDismiss}
        closeOnOutside={closeOnOutside}
        closeOnEscape={closeOnEscape}
        insideRefs={insideRefs}
        className={cx(
          surface && 'ui-floating',
          animation === 'pop' && 'ui-animate-pop',
          animation === 'fade' && 'ui-animate-fade',
          animation === 'spring' && 'ui-animate-spring',
          className,
        )}
        style={style}
      >
        {children}
      </FloatingContent>
    </Portal>
  );
}

interface ContentProps extends Omit<FloatingProps, 'surface' | 'animation'> {
  state: 'open' | 'closed';
}

function FloatingContent({
  open,
  state,
  anchorRef,
  placement,
  offset,
  matchAnchorWidth,
  onDismiss,
  closeOnOutside,
  closeOnEscape,
  insideRefs = [],
  style,
  ref,
  children,
  ...rest
}: ContentProps) {
  const floatingRef = useRef<HTMLDivElement>(null);
  const { floatingStyles, side, align } = useFloating({
    open,
    anchorRef,
    floatingRef,
    placement,
    offset,
    matchAnchorWidth,
  });

  const anchorElementRef = {
    get current() {
      const anchor = anchorRef.current;
      return anchor instanceof Element ? anchor : null;
    },
  };

  useDismissableLayer({
    enabled: open && !!onDismiss,
    refs: [floatingRef, anchorElementRef, ...insideRefs],
    onDismiss: (reason) => onDismiss?.(reason),
    closeOnEscape,
    closeOnOutside,
  });

  return (
    <div
      {...rest}
      ref={mergeRefs(floatingRef, ref)}
      data-ui-portal=""
      data-state={state}
      data-side={side}
      data-align={align}
      // While the exit animation plays, the fading menu or popover takes no clicks (no double selections).
      inert={state === 'closed' || undefined}
      style={{ ...floatingStyles, zIndex: 'var(--ui-z-popover)', ...style }}
    >
      {children}
    </div>
  );
}
