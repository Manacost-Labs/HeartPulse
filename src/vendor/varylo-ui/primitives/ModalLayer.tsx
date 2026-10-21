'use client';

import { useRef, type ComponentPropsWithRef, type ReactNode, type RefObject } from 'react';
import { Portal, usePortalContainer } from './Portal';
import { useDismissableLayer } from './useDismissableLayer';
import { useFocusTrap } from './useFocusTrap';
import { usePresence } from './usePresence';
import { useScrollLock } from './useScrollLock';
import { cx, getDirection, mergeRefs, type Direction } from './utils';
import './ModalLayer.css';
import './motion.css';

export type ModalPlacement = 'center' | 'top' | 'left' | 'right' | 'bottom' | 'start' | 'end';
export type PhysicalModalPlacement = Exclude<ModalPlacement, 'start' | 'end'>;

/** `start` / `end` follow the page direction: start is the left edge in LTR and the right edge in RTL. */
export function resolveModalPlacement(placement: ModalPlacement, direction: Direction): PhysicalModalPlacement {
  if (placement === 'start') return direction === 'rtl' ? 'right' : 'left';
  if (placement === 'end') return direction === 'rtl' ? 'left' : 'right';
  return placement;
}

export interface ModalLayerProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  open: boolean;
  onClose: () => void;
  /**
   * Where the panel sits; also picks the enter/exit animation. `start` / `end` are logical sides
   * (a drawer that follows the reading direction); `data-placement` always carries the resolved physical side.
   */
  placement?: ModalPlacement;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Class for the full-screen layer (positioning wrapper). */
  layerClassName?: string;
  /**
   * `spring`: the panel springs in (centred panels drop in from `from` with a slight tilt, edge panels
   * slide in critically damped). `default`: the theme's own enter and exit.
   */
  animation?: 'default' | 'spring';
  /** Side a centred panel springs in from with `animation="spring"` (default `top`). */
  from?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactNode;
}

/**
 * Modal foundation: portal, scrim, focus trap, scroll lock, Escape/outside
 * dismissal and animations. The panel itself (role="dialog") gets `className`;
 * consumers add aria-labelledby/aria-describedby.
 */
export function ModalLayer({
  open,
  onClose,
  placement = 'center',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  initialFocusRef,
  layerClassName,
  animation = 'default',
  from = 'top',
  className,
  ref,
  children,
  ...rest
}: ModalLayerProps) {
  // Longer than the slowest exit animation (Glass --ui-duration is 240ms), so it is never cut off.
  const { isMounted, state } = usePresence(open, 300);
  const panelRef = useRef<HTMLDivElement>(null);
  const container = usePortalContainer();

  useScrollLock(open);
  // `container` too: inside a ThemeScope that is still mounting, the panel appears one commit later.
  useFocusTrap(panelRef, open && isMounted && !!container, { initialFocusRef });
  useDismissableLayer({
    enabled: open,
    refs: [panelRef],
    onDismiss: onClose,
    closeOnEscape,
    closeOnOutside: closeOnOverlayClick,
  });

  // No container on the server (and briefly inside a ThemeScope that is still mounting): nothing to portal into yet.
  if (!isMounted || !container) return null;
  // The layer is portaled (to <body>, or into a ThemeScope), so the container's direction decides which edge "start" is.
  const side = resolveModalPlacement(placement, getDirection(container));

  return (
    <Portal>
      <div
        className={cx('ui-modal-layer', layerClassName)}
        data-ui-portal=""
        data-state={state}
        data-placement={side}
        // While the exit animation plays, the fading layer takes no clicks or focus (no double actions).
        inert={state === 'closed' || undefined}
      >
        <div className="ui-modal-layer__overlay" data-state={state} aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          {...rest}
          ref={mergeRefs(panelRef, ref)}
          className={cx('ui-modal-layer__panel', className)}
          data-state={state}
          data-placement={side}
          data-motion={animation === 'spring' ? 'spring' : undefined}
          data-from={animation === 'spring' ? from : undefined}
        >
          {children}
        </div>
      </div>
    </Portal>
  );
}
