'use client';

import { useEffect, useMemo, useRef, useState, type ComponentPropsWithRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { XIcon } from '../icons';
import {
  composeHandlers,
  cx,
  getDirection,
  inlineArrowStep,
  mergeRefs,
  Portal,
  useControllableState,
  useDismissableLayer,
  useFloating,
  useFocusTrap,
  useLatest,
  usePresence,
  type Placement,
  type VirtualElement,
} from '../primitives';
import { Button } from '../basic/Button';
import { IconButton } from '../basic/IconButton';
import './Tour.css';
import { withRef, useId, useLayoutEffect } from '../primitives/react-compat';

export interface TourStep {
  /** Element to highlight: a CSS selector, a ref or a getter. Without one (or when it isn't found) the step is centered. */
  target?: string | RefObject<Element | null> | (() => Element | null);
  title: ReactNode;
  content?: ReactNode;
  /** Image, video or illustration above the title. */
  media?: ReactNode;
  /** Side of the target the card prefers; it flips when there's no room. Default `bottom`. */
  placement?: Placement;
  /** Runs before the step shows (open a menu, switch a tab, load data); the tour waits for it. */
  beforeStep?: () => void | Promise<void>;
  /** Lets the user click the highlighted element. Default false. */
  interactive?: boolean;
  /** Space between the target and the spotlight edge, px. Default 8. */
  spotlightPadding?: number;
}

export interface TourLabels {
  next: string;
  back: string;
  finish: string;
  skip: string;
  /** "2 of 5", visible above the title. */
  progress: (current: number, total: number) => string;
}

export const defaultTourLabels: TourLabels = {
  next: 'Next',
  back: 'Back',
  finish: 'Done',
  skip: 'Skip tour',
  progress: (current, total) => `${current} of ${total}`,
};

/** Native attributes, `style` and `ref` go to the step card (the dialog). */
export interface TourProps extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  /** Stops in order; each spotlights its `target` (or is centered without one) with a card of title, text and media. */
  steps: TourStep[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Current step; keep it to resume the tour where the user left. */
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  /** Called when the user presses Done on the last step. */
  onFinish?: () => void;
  /** Called when the user leaves early (✕ or Escape), with the step they left on. */
  onSkip?: (step: number) => void;
  /** Escape skips the tour. Default true. */
  closeOnEscape?: boolean;
  /** A click on the dimmed backdrop skips the tour. Default false. */
  closeOnOverlayClick?: boolean;
  /** Progress dots. Default true. */
  showProgress?: boolean;
  /** Class for the card. */
  className?: string;
  labels?: Partial<TourLabels>;
  // HearthPulse: a phone shows the card as a bottom sheet, extra actions sit
  // under the main buttons, the page may scroll the target itself, and the
  // spotlight stays inside the part of the viewport the sheet leaves free.
  /** Shows the card as a bottom sheet instead of a popover next to the target. */
  sheet?: boolean;
  /** Secondary actions rendered under the step buttons. */
  footer?: ReactNode;
  /** Replaces the default centering scroll before a step is shown. */
  scrollTarget?: (element: Element) => void;
  /** Viewport insets (px) the spotlight is clamped to, e.g. the sheet height at the bottom. */
  spotlightInsets?: { top: number; bottom: number };
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function resolveTarget(target: TourStep['target']): Element | null {
  if (!target) return null;
  if (typeof target === 'string') return document.querySelector(target);
  if (typeof target === 'function') return target();
  return target.current;
}

/** Waits up to ~1s for a target that a `beforeStep` is still rendering. */
function waitForTarget(target: TourStep['target'], cancelled: () => boolean): Promise<Element | null> {
  return new Promise((resolve) => {
    let frames = 0;
    const tick = () => {
      if (cancelled()) return resolve(null);
      const element = resolveTarget(target);
      if (element || !target || frames++ > 60) return resolve(element);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function scrollIntoViewIfNeeded(element: Element) {
  const r = element.getBoundingClientRect();
  const margin = 24;
  if (r.top >= margin && r.bottom <= window.innerHeight - margin && r.left >= 0 && r.right <= window.innerWidth) return;
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
}

function paddedBox(element: Element, padding: number): Box {
  const r = element.getBoundingClientRect();
  return { x: r.left - padding, y: r.top - padding, width: r.width + padding * 2, height: r.height + padding * 2 };
}

// HearthPulse: a target taller than the free viewport is cut to it, so the ring stays visible and off the sheet.
function clampedBox(box: Box, insets: { top: number; bottom: number } | undefined): Box {
  if (!insets) return box;
  const left = Math.max(4, box.x);
  const right = Math.min(document.documentElement.clientWidth - 4, box.x + box.width);
  const top = Math.max(insets.top, box.y);
  const bottom = Math.min(window.innerHeight - insets.bottom, box.y + box.height);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** The viewport with a rounded hole: an even-odd path, so clicks pass through the hole. */
export function spotlightPath(box: Box, viewport: { width: number; height: number }, radius: number) {
  const r = Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
  const { x, y, width: w, height: h } = box;
  const n = (v: number) => Math.round(v * 10) / 10;
  return (
    `path(evenodd, 'M0 0H${n(viewport.width)}V${n(viewport.height)}H0Z` +
    `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    `V${n(y + h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    `H${n(x + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    `V${n(y + r)}A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}Z')`
  );
}

/** Live padded rect of `element`, following scroll, resize and its own size changes. */
function useSpotlightBox(element: Element | null, padding: number, insets?: { top: number; bottom: number }) {
  const [box, setBox] = useState<Box | null>(null);
  useLayoutEffect(() => {
    if (!element) {
      setBox(null);
      return;
    }
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = clampedBox(paddedBox(element, padding), insets);
        setBox((prev) =>
          prev && prev.x === next.x && prev.y === next.y && prev.width === next.width && prev.height === next.height ? prev : next,
        );
      });
    };
    setBox(clampedBox(paddedBox(element, padding), insets));
    window.addEventListener('scroll', measure, { capture: true, passive: true });
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, { capture: true });
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [element, padding, insets?.top, insets?.bottom]);
  return box;
}

function reportError(error: unknown) {
  if (typeof globalThis.reportError === 'function') globalThis.reportError(error);
  else console.error(error);
}

/**
 * Product tour: dims the page around a spotlight on each step's target, with a card
 * (title, body, media, progress) next to it. Steps can wait on async work, the target
 * scrolls into view, arrow keys page through the steps and the step is controllable,
 * so a tour can resume where it was left.
 */
export const Tour = withRef(function Tour({
  steps,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  step: stepProp,
  defaultStep = 0,
  onStepChange,
  onFinish,
  onSkip,
  closeOnEscape = true,
  closeOnOverlayClick = false,
  showProgress = true,
  className,
  labels: labelsProp,
  sheet = false,
  footer,
  scrollTarget,
  spotlightInsets,
  ...cardProps
}: TourProps) {
  const labels = { ...defaultTourLabels, ...labelsProp };
  const [open, setOpen] = useControllableState({ value: openProp, defaultValue: defaultOpen, onChange: onOpenChange });
  const [rawStep, setStep] = useControllableState({ value: stepProp, defaultValue: defaultStep, onChange: onStepChange });
  const current = Math.min(Math.max(0, rawStep), Math.max(0, steps.length - 1));
  // The step on screen: it changes once the next step's beforeStep and target are ready.
  const [shown, setShown] = useState<{ index: number; element: Element | null; session: number } | null>(null);
  // Each opening is a session, so a reopened tour never flashes the card it closed with.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((s) => s + 1);
  }
  const [pending, setPending] = useState(false);
  const [moving, setMoving] = useState(false);
  const stepsRef = useLatest(steps);
  const shownRef = useLatest(shown);
  const returnFocus = useRef<HTMLElement | null>(null);
  const scrollTargetRef = useLatest(scrollTarget);
  const visible = shown && (shown.session === session || !open) ? shown : null;
  const { isMounted, state } = usePresence(open && visible !== null, 240);

  useEffect(() => {
    if (!open) {
      setPending(false);
      return;
    }
    if (!returnFocus.current && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    const step = stepsRef.current[current];
    if (!step) return;
    let cancelled = false;
    void (async () => {
      setPending(true);
      try {
        await step.beforeStep?.();
      } catch (error) {
        if (cancelled) return;
        setPending(false);
        reportError(error);
        // Stay where the user was; a tour that can't show its first step closes.
        const previous = shownRef.current;
        if (previous && previous.session === session) setStep(previous.index);
        else setOpen(false);
        return;
      }
      const element = await waitForTarget(step.target, () => cancelled);
      if (cancelled) return;
      if (element) (scrollTargetRef.current ?? scrollIntoViewIfNeeded)(element);
      setShown((prev) => {
        if (prev && prev.session === session && prev.index !== current) setMoving(true);
        return { index: current, element, session };
      });
      setPending(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, current, session, stepsRef, shownRef, scrollTargetRef, setStep, setOpen]);

  useEffect(() => {
    if (!moving) return;
    const timer = setTimeout(() => setMoving(false), 450);
    return () => clearTimeout(timer);
  }, [moving, shown]);

  useEffect(() => {
    if (open) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [open]);

  const close = (finished: boolean) => {
    if (finished) onFinish?.();
    else onSkip?.(visible?.index ?? current);
    setOpen(false);
  };

  const go = (delta: number) => {
    if (pending || !open) return;
    const to = (visible?.index ?? current) + delta;
    if (to < 0) return;
    if (to >= steps.length) close(true);
    else setStep(to);
  };

  if (!isMounted || !visible) return null;
  const step = steps[visible.index];
  if (!step) return null;

  return (
    <Portal>
      <TourLayer
        state={state}
        step={step}
        index={visible.index}
        total={steps.length}
        element={visible.element}
        moving={moving}
        pending={pending}
        showProgress={showProgress}
        closeOnEscape={closeOnEscape}
        closeOnOverlayClick={closeOnOverlayClick}
        className={className}
        cardProps={cardProps}
        labels={labels}
        sheet={sheet}
        footer={footer}
        spotlightInsets={spotlightInsets}
        onBack={() => go(-1)}
        onNext={() => go(1)}
        onSkip={() => close(false)}
      />
    </Portal>
  );
});

interface LayerProps {
  state: 'open' | 'closed';
  step: TourStep;
  index: number;
  total: number;
  element: Element | null;
  moving: boolean;
  pending: boolean;
  showProgress: boolean;
  closeOnEscape: boolean;
  closeOnOverlayClick: boolean;
  className?: string;
  cardProps: ComponentPropsWithRef<'div'>;
  labels: TourLabels;
  sheet: boolean;
  footer?: ReactNode;
  spotlightInsets?: { top: number; bottom: number };
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

function TourLayer({ state, step, element, moving, closeOnOverlayClick, spotlightInsets, ...props }: LayerProps) {
  const padding = step.spotlightPadding ?? 8;
  const box = useSpotlightBox(element, padding, spotlightInsets);
  const viewport = useViewportSize();
  const radius = useSpotlightRadius(element);
  const hole: CSSProperties | undefined = box ? { left: box.x, top: box.y, width: box.width, height: box.height } : undefined;

  return (
    <div className="ui-tour" data-state={state} data-moving={moving || undefined}>
      <div
        className="ui-tour__overlay"
        aria-hidden="true"
        style={{ clipPath: box && viewport ? spotlightPath(box, viewport, radius + padding / 2) : undefined }}
        onClick={closeOnOverlayClick ? props.onSkip : undefined}
      />
      {hole && !step.interactive && <div className="ui-tour__blocker" aria-hidden="true" style={hole} />}
      {hole && <div className="ui-tour__spotlight" aria-hidden="true" style={{ ...hole, borderRadius: radius + padding / 2 }} />}
      <TourCard key={props.index} step={step} element={element} padding={padding} state={state} {...props} />
    </div>
  );
}

function useViewportSize() {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => setSize({ width: document.documentElement.clientWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

/** Follows the target's own corner radius, so a pill button gets a pill-shaped spotlight. */
function useSpotlightRadius(element: Element | null) {
  return useMemo(() => {
    if (!element) return 0;
    const value = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
    const r = element.getBoundingClientRect();
    return Math.min(value, r.height / 2, r.width / 2, 24);
  }, [element]);
}

interface CardProps extends Omit<LayerProps, 'moving' | 'closeOnOverlayClick' | 'spotlightInsets'> {
  padding: number;
}

function TourCard({
  state,
  step,
  index,
  total,
  element,
  padding,
  pending,
  showProgress,
  closeOnEscape,
  className,
  cardProps,
  labels,
  sheet,
  footer,
  onBack,
  onNext,
  onSkip,
}: CardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const centered = element === null;
  // Reads the target live, so the card and the spotlight move in the same frame while scrolling.
  const anchorRef = useMemo<RefObject<VirtualElement | null>>(
    () => ({ current: element ? { getBoundingClientRect: () => DOMRect.fromRect(paddedBox(element, padding)) } : null }),
    [element, padding],
  );
  const docked = centered || sheet;
  const { floatingStyles, side } = useFloating({
    open: !docked,
    anchorRef,
    floatingRef: cardRef,
    placement: step.placement ?? 'bottom',
    offset: 12,
    padding: 12,
  });

  // An interactive step lets the user operate the highlighted element, so the keyboard must reach it too: no trap,
  // and the card is not modal; focus still starts on the card's primary button.
  const trap = !step.interactive;
  useFocusTrap(cardRef, trap, { initialFocusRef: primaryRef, restoreFocus: false });
  useEffect(() => {
    if (!trap) primaryRef.current?.focus({ preventScroll: true });
  }, [trap, index]);
  useDismissableLayer({
    enabled: state === 'open' && closeOnEscape,
    refs: [cardRef],
    onDismiss: (reason) => {
      if (reason === 'escape') onSkip();
    },
    closeOnOutside: false,
  });

  const last = index === total - 1;
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const delta = inlineArrowStep(event.key, getDirection(event.currentTarget));
    if (!delta) return;
    event.preventDefault();
    if (delta > 0) onNext();
    else if (index > 0) onBack();
  };

  const card = (
    <div
      {...cardProps}
      ref={mergeRefs(cardRef, cardProps.ref)}
      role="dialog"
      aria-modal={trap || undefined}
      aria-labelledby={titleId}
      aria-describedby={cx(cardProps['aria-describedby'], step.content ? bodyId : undefined) || undefined}
      tabIndex={-1}
      className={cx('ui-tour__card ui-floating ui-animate-pop', className)}
      data-state={state}
      data-side={docked ? undefined : side}
      data-centered={(centered && !sheet) || undefined}
      data-sheet={sheet || undefined}
      style={{ ...(docked ? undefined : floatingStyles), ...cardProps.style }}
      onKeyDown={composeHandlers(cardProps.onKeyDown, handleKeyDown)}
    >
      {step.media && <div className="ui-tour__media">{step.media}</div>}
      <div className="ui-tour__main">
        <div className="ui-tour__header">
          <div className="ui-tour__heading">
            <span className="ui-tour__progress-text">{labels.progress(index + 1, total)}</span>
            <h2 id={titleId} className="ui-tour__title">
              {step.title}
            </h2>
          </div>
          <IconButton size="sm" icon={<XIcon />} label={labels.skip} className="ui-tour__close" onClick={onSkip} />
        </div>
        {step.content && (
          <div id={bodyId} className="ui-tour__body">
            {step.content}
          </div>
        )}
        <div className="ui-tour__footer">
          {showProgress && total > 1 && (
            <span className="ui-tour__dots" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <span key={i} className="ui-tour__dot" data-state={i === index ? 'current' : i < index ? 'done' : undefined} />
              ))}
            </span>
          )}
          <div className="ui-tour__actions">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={onBack} disabled={pending}>
                {labels.back}
              </Button>
            )}
            <Button ref={primaryRef} size="sm" variant="primary" loading={pending} onClick={onNext}>
              {last ? labels.finish : labels.next}
            </Button>
          </div>
        </div>
        {footer && <div className="ui-tour__extra">{footer}</div>}
      </div>
    </div>
  );

  return centered && !sheet ? <div className="ui-tour__center">{card}</div> : card;
}
