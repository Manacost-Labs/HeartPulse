'use client';

import { cloneElement, createContext, useEffect, useRef, useState, type ComponentPropsWithRef, type FocusEvent, type PointerEvent, type ReactElement, type ReactNode, type Ref } from 'react';
import {
  composeHandlers,
  cx,
  Floating,
  mergeRefs,
  Slot,
  useControllableState,
  useDismissableLayer,
  useEventCallback,
  type Placement,
} from '../primitives';
import './Tooltip.css';
import { collectionPart, partsOf, propsOf } from '../primitives/compound';
import { getElementRef, withRef, useId } from '../primitives/react-compat';

/** Native attributes, `style` and `ref` go to the tooltip surface. */
export interface TooltipProps extends Omit<ComponentPropsWithRef<'div'>, 'content' | 'children'> {
  /** Tooltip text or content; nothing shows while it is empty. Or `Tooltip.Content` in the children. */
  content?: ReactNode;
  /**
   * A single focusable element. It receives the hover/focus handlers and aria-describedby. In the compound form,
   * a `Tooltip.Trigger` and a `Tooltip.Content` instead.
   */
  children: ReactElement | ReactElement[];
  /** Preferred side and alignment relative to the trigger; flips when there is no room. */
  placement?: Placement;
  /** Delay before showing, ms. Skipped while another tooltip was just visible. */
  delay?: number;
  /** Never show the tooltip; the trigger keeps working. */
  disabled?: boolean;
  /** Small pointer towards the trigger. */
  arrow?: boolean;
  /**
   * `fade` (default) or `spring`: springs out of the trigger's side, and moving straight on to the next
   * spring tooltip glides the tooltip across instead of fading one out and another in.
   */
  animation?: 'fade' | 'spring';
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Class for the tooltip surface. */
  className?: string;
}

export interface TooltipTriggerProps {
  /** A single focusable element. */
  children: ReactElement;
}

/** Props of the tooltip surface (merged with the Tooltip's own) and its content. */
export interface TooltipContentProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  children?: ReactNode;
}

/** The element the tooltip describes (`Tooltip.Trigger`). */
export const TooltipTrigger = collectionPart<TooltipTriggerProps>('Tooltip.Trigger');
/** The tooltip text or content (`Tooltip.Content`); its props go to the surface. */
export const TooltipContent = collectionPart<TooltipContentProps>('Tooltip.Content');

/** True inside a Tooltip trigger, so IconButton can drop its native title (it would show twice). */
export const TooltipTriggerContext = createContext(false);

// After one tooltip closes, the next opens without delay for a moment, so scanning a toolbar feels instant.
const WARM_MS = 500;
let lastClosedAt = -Infinity;
// Leaving the trigger waits this long before hiding, so the pointer can cross onto the tooltip (WCAG 1.4.13).
const HIDE_GRACE_MS = 120;
// Only one tooltip shows at a time: opening one closes another still in its grace period.
// `instant`: the next tooltip glides in from this one, so it vanishes at once instead of fading.
let closeActive: ((instant?: boolean) => void) | null = null;
// Trigger of the tooltip shown last: a spring tooltip opening while warm glides in from there.
let lastAnchor: DOMRect | null = null;

/** Offset from the trigger shown last to `rect` (centre to centre), or null when there is nothing to glide from. */
function glideFrom(rect: DOMRect): { x: number; y: number } | null {
  if (!lastAnchor) return null;
  const x = lastAnchor.left + lastAnchor.width / 2 - (rect.left + rect.width / 2);
  const y = lastAnchor.top + lastAnchor.height / 2 - (rect.top + rect.height / 2);
  return x || y ? { x, y } : null;
}

export const Tooltip = withRef(function Tooltip({
  content: contentProp,
  children: childrenProp,
  placement = 'top',
  delay = 400,
  disabled = false,
  arrow = false,
  animation = 'fade',
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
  style,
  onPointerEnter,
  onPointerLeave,
  ref,
  ...rest
}: TooltipProps) {
  const triggerPart = partsOf<TooltipTriggerProps>(childrenProp, TooltipTrigger)[0];
  const contentPart = triggerPart && partsOf<TooltipContentProps>(childrenProp, TooltipContent)[0];
  const children = (triggerPart ? triggerPart.props.children : childrenProp) as ReactElement;
  const content = contentProp ?? contentPart?.props.children;
  const surfaceProps = propsOf(contentPart);
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const triggerRef = useRef<HTMLElement>(null);
  const timer = useRef<number>(undefined);
  const id = useId();
  const [glide, setGlide] = useState<{ x: number; y: number } | null>(null);
  const [instantExit, setInstantExit] = useState(false);
  const hasContent = content != null && content !== false && content !== '';
  const visible = open && !disabled && hasContent;
  const offset = arrow ? 10 : 6;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const show = (immediate = false) => {
    if (disabled || !hasContent) return;
    window.clearTimeout(timer.current);
    const warm = closeActive !== null || performance.now() - lastClosedAt < WARM_MS;
    const rect = triggerRef.current?.getBoundingClientRect();
    setGlide(animation === 'spring' && warm && rect ? glideFrom(rect) : null);
    setInstantExit(false);
    if (immediate || delay <= 0 || warm) setOpen(true);
    else timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = useEventCallback((instant?: boolean) => {
    window.clearTimeout(timer.current);
    if (visible) lastClosedAt = performance.now();
    setInstantExit(instant === true);
    setOpen(false);
  });
  const hideSoon = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => hide(), HIDE_GRACE_MS);
  };
  const keepOpen = () => window.clearTimeout(timer.current);

  useEffect(() => {
    if (!visible) return;
    if (closeActive !== hide) closeActive?.(glide !== null);
    closeActive = hide;
    lastAnchor = triggerRef.current?.getBoundingClientRect() ?? null;
    return () => {
      if (closeActive === hide) closeActive = null;
    };
  }, [visible, hide, glide]);

  // Escape closes the tooltip first; outside presses ignore it and reach the layers below.
  useDismissableLayer({ enabled: visible, refs: [], onDismiss: () => hide(), closeOnOutside: false, passThrough: true });

  const childDescribedBy = (children.props as { 'aria-describedby'?: string })['aria-describedby'];
  const trigger = cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
    'aria-describedby': cx(childDescribedBy, visible && id) || undefined,
  });

  return (
    <TooltipTriggerContext.Provider value={true}>
      <Slot
        ref={triggerRef}
        onPointerEnter={(event: PointerEvent) => {
          // Touch has no hover; a tap should just activate the control.
          if (event.pointerType !== 'touch') show();
        }}
        onPointerLeave={hideSoon}
        onPointerDown={() => hide()}
        onFocus={(event: FocusEvent<HTMLElement>) => {
          // Only keyboard focus shows the tooltip, and immediately.
          if (event.target.matches(':focus-visible')) show(true);
        }}
        onBlur={() => hide()}
      >
        {trigger}
      </Slot>
      <TooltipTriggerContext.Provider value={false}>
        <Floating
          {...rest}
          {...surfaceProps}
          ref={contentPart ? mergeRefs(ref, getElementRef(contentPart) as Ref<HTMLDivElement>) : ref}
          open={visible}
          anchorRef={triggerRef}
          placement={placement}
          offset={offset}
          surface={false}
          animation={animation}
          id={id}
          role="tooltip"
          className={cx('ui-tooltip', className, surfaceProps.className)}
          data-arrow={arrow || undefined}
          data-glide={glide ? '' : undefined}
          data-instant={instantExit || undefined}
          style={{
            zIndex: 'var(--ui-z-tooltip)',
            ['--_gap' as string]: `${offset}px`,
            ...(glide && { ['--_glide-x' as string]: `${glide.x}px`, ['--_glide-y' as string]: `${glide.y}px` }),
            ...style,
            ...surfaceProps.style,
          }}
          // The content is hoverable: the pointer may rest on it without it disappearing.
          onPointerEnter={composeHandlers(surfaceProps.onPointerEnter, composeHandlers(onPointerEnter, keepOpen))}
          onPointerLeave={composeHandlers(surfaceProps.onPointerLeave, composeHandlers(onPointerLeave, hideSoon))}
        >
          {content}
          {arrow && <span className="ui-tooltip__arrow" aria-hidden="true" />}
        </Floating>
      </TooltipTriggerContext.Provider>
    </TooltipTriggerContext.Provider>
  );
}, { Trigger: TooltipTrigger, Content: TooltipContent });
