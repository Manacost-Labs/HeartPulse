import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import {
  PAGE_TOURS,
  isTourStepEligible,
  type PageTourAccess,
  type PageTourDefinition,
  type PageTourStep,
} from './pageTourDefinitions';
import {
  parsePageTourStepProgress,
  pageTourStorageKey,
  placeTourPopover,
  restorePageTourStepIndex,
  resolvePageTour,
  scheduleTourScrollCorrection,
  shouldWaitForRestoredTourStep,
  type PageTourStepProgress,
  type TourPlacement,
  type TourRect,
} from './pageTourModel';
import './PageTour.css';

type PageTourProps = {
  pagePath: string;
  access: PageTourAccess;
  onClose: () => void;
};

type PopoverPosition = {
  left: number;
  top: number;
  placement: TourPlacement;
};

const MOBILE_QUERY = '(max-width: 760px), (max-height: 520px), (pointer: coarse) and (max-width: 900px)';
const TARGET_PADDING = 7;

function writeProgress(tour: PageTourDefinition, progress: PageTourStepProgress): void {
  try {
    window.localStorage.setItem(pageTourStorageKey(tour), JSON.stringify(progress));
  } catch {
    // Storage may be unavailable in strict privacy modes; the tour remains usable.
  }
}

function visibleTarget(target: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(`[data-tour-id="${CSS.escape(target)}"]`);
  for (const element of candidates) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (
      style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && element.getClientRects().length > 0
      && rect.width > 0
      && rect.height > 0
    ) return element;
  }
  return null;
}

function paddedRect(element: HTMLElement): TourRect {
  const rect = element.getBoundingClientRect();
  const left = Math.max(4, rect.left - TARGET_PADDING);
  const top = Math.max(4, rect.top - TARGET_PADDING);
  const right = Math.min(window.innerWidth - 4, rect.right + TARGET_PADDING);
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const bottom = Math.min(viewportHeight - 4, rect.bottom + TARGET_PADDING);
  return {
    left,
    top,
    right,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function paywallStep(tour: PageTourDefinition): PageTourStep {
  const isStandard = tour.id.startsWith('standard-');
  return {
    id: 'paywall',
    target: 'subscription-paywall',
    title: isStandard ? 'Доступ к статистике Стандарта' : 'Доступ к закрытому разделу',
    description: isStandard
      ? 'Тариф «Алмаз» открывает эту статистику, мету и готовые сборки. Войдите в профиль или обновите подписку прямо в этом блоке.'
      : 'Войдите в профиль и проверьте подписку. В этом блоке указаны подходящий уровень доступа и способы его подключения.',
    preferredPlacement: 'top',
  };
}

function resolveSteps(tour: PageTourDefinition, access: PageTourAccess): PageTourStep[] {
  const eligible = tour.steps.filter(step => isTourStepEligible(step, access));
  const available = eligible.filter(step => visibleTarget(step.target));
  if (available.length > 0) return available;
  return visibleTarget('subscription-paywall') ? [paywallStep(tour)] : [];
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter(element => element.getClientRects().length > 0);
}

export default function PageTour({ pagePath, access, onClose }: PageTourProps) {
  const tour = useMemo(() => resolvePageTour(pagePath, PAGE_TOURS), [pagePath]);
  const storedProgress = useMemo(() => {
    if (!tour) return null;
    try {
      return parsePageTourStepProgress(window.localStorage.getItem(pageTourStorageKey(tour)));
    } catch {
      return null;
    }
  }, [tour]);
  const [steps, setSteps] = useState<PageTourStep[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TourRect | null>(null);
  const [popoverSize, setPopoverSize] = useState({ width: 376, height: 286 });
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [waiting, setWaiting] = useState(true);
  const [progressRestored, setProgressRestored] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const previousStepIdRef = useRef<string | null>(null);
  const discoveryTimedOutRef = useRef(false);

  const currentStep = steps[stepIndex] ?? null;

  const closeTour = useCallback((status: PageTourStepProgress['status'] = 'dismissed') => {
    if (tour) writeProgress(tour, { status, stepId: currentStep?.id });
    onClose();
  }, [currentStep?.id, onClose, tour]);

  useEffect(() => {
    if (!tour) {
      onClose();
      return undefined;
    }

    let timeoutId = 0;
    const main = document.getElementById('main-content') ?? document.body;
    const refresh = () => {
      const eligibleStepIds = tour.steps
        .filter(step => isTourStepEligible(step, access))
        .map(step => step.id);
      const nextSteps = resolveSteps(tour, access);
      setSteps(previous => {
        if (
          previous.length === nextSteps.length
          && previous.every((step, index) => step.id === nextSteps[index]?.id)
        ) return previous;
        return nextSteps;
      });
      const waitingForRestoredStep = !progressRestored && shouldWaitForRestoredTourStep(
        storedProgress,
        eligibleStepIds,
        nextSteps.map(step => step.id),
      );
      setWaiting(!discoveryTimedOutRef.current && (nextSteps.length === 0 || waitingForRestoredStep));
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
    timeoutId = window.setTimeout(() => {
      discoveryTimedOutRef.current = true;
      setWaiting(false);
    }, 8_000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [access, onClose, progressRestored, storedProgress, tour]);

  useEffect(() => {
    if (!tour || steps.length === 0 || progressRestored || waiting) return;
    const restoredIndex = restorePageTourStepIndex(
      storedProgress,
      steps.map(step => step.id),
    );
    setStepIndex(restoredIndex);
    previousStepIdRef.current = steps[restoredIndex]?.id ?? null;
    setProgressRestored(true);
  }, [progressRestored, steps, storedProgress, tour, waiting]);

  useEffect(() => {
    if (!progressRestored || !currentStep) return;
    previousStepIdRef.current = currentStep.id;
    if (tour) writeProgress(tour, { status: 'in-progress', stepId: currentStep.id });
  }, [currentStep, progressRestored, tour]);

  useEffect(() => {
    if (steps.length === 0) return;
    const previousId = previousStepIdRef.current;
    if (!previousId) return;
    const nextIndex = steps.findIndex(step => step.id === previousId);
    setStepIndex(index => nextIndex >= 0 ? nextIndex : Math.min(index, steps.length - 1));
  }, [steps]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useLayoutEffect(() => {
    const body = document.body;
    const previousPaddingBottom = body.style.paddingBottom;
    const currentPaddingBottom = Number.parseFloat(window.getComputedStyle(body).paddingBottom) || 0;
    const clearance = mobile
      ? Math.ceil(Math.min(popoverSize.height, (window.visualViewport?.height ?? window.innerHeight) * 0.45) + 56)
      : Math.ceil(popoverSize.height + 48);
    body.style.paddingBottom = `${currentPaddingBottom + clearance}px`;
    return () => { body.style.paddingBottom = previousPaddingBottom; };
  }, [mobile, popoverSize.height]);

  useLayoutEffect(() => {
    if (!currentStep) {
      setTargetRect(null);
      return undefined;
    }
    const target = visibleTarget(currentStep.target);
    if (!target) return undefined;
    let cancelScrollCorrection: (() => void) | undefined;
    const correctMobileScroll = () => {
      const rect = target.getBoundingClientRect();
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const safeTop = Math.min(118, Math.max(52, viewportHeight * 0.28));
      const sheetHeight = Math.min(popoverSize.height, viewportHeight * 0.45);
      const safeBottom = Math.max(safeTop + 48, viewportHeight - sheetHeight - 22);
      if (rect.top < safeTop) window.scrollBy({ top: rect.top - safeTop, behavior: 'auto' });
      else if (rect.bottom > safeBottom) window.scrollBy({ top: rect.bottom - safeBottom, behavior: 'auto' });
    };
    const scrollTargetIntoView = () => {
      target.scrollIntoView({ behavior: 'auto', block: mobile ? 'start' : 'center', inline: 'nearest' });
      if (mobile) {
        correctMobileScroll();
        cancelScrollCorrection = scheduleTourScrollCorrection(correctMobileScroll, 160, window);
      }
    };
    scrollTargetIntoView();

    let frame = 0;
    const updateRect = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setTargetRect(paddedRect(target)));
    };
    updateRect();
    const resizeObserver = new ResizeObserver(updateRect);
    resizeObserver.observe(target);
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    window.visualViewport?.addEventListener('resize', updateRect);
    window.visualViewport?.addEventListener('scroll', updateRect);
    const settledTimer = window.setTimeout(updateRect, 520);
    return () => {
      cancelScrollCorrection?.();
      window.clearTimeout(settledTimer);
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      window.visualViewport?.removeEventListener('resize', updateRect);
      window.visualViewport?.removeEventListener('scroll', updateRect);
    };
  }, [currentStep, mobile, popoverSize.height]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const update = () => {
      const rect = dialog.getBoundingClientRect();
      setPopoverSize({ width: rect.width, height: rect.height });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(dialog);
    return () => observer.disconnect();
  }, [currentStep, waiting]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.inert ?? false;
    if (root) root.inert = true;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      if (root) root.inert = rootWasInert;
      previousFocusRef.current?.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeTour('dismissed');
        return;
      }
      if (event.key === 'ArrowRight' && currentStep && stepIndex < steps.length - 1) {
        event.preventDefault();
        setStepIndex(index => Math.min(index + 1, steps.length - 1));
        return;
      }
      if (event.key === 'ArrowLeft' && currentStep && stepIndex > 0) {
        event.preventDefault();
        setStepIndex(index => Math.max(index - 1, 0));
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusables = focusableElements(dialogRef.current);
      if (focusables.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeTour, currentStep, stepIndex, steps.length]);

  const position: PopoverPosition = targetRect
    ? placeTourPopover({
      targetRect,
      popoverSize,
      viewport: {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      preferredPlacement: currentStep?.preferredPlacement,
      mobile,
      padding: mobile ? 8 : 16,
      gap: 16,
    })
    : {
      left: Math.max(8, (window.innerWidth - popoverSize.width) / 2),
      top: Math.max(8, (window.innerHeight - popoverSize.height) / 2),
      placement: mobile ? 'bottom-sheet' : 'bottom',
    };

  if (!tour) return null;

  const stepCount = steps.length;
  const finalStep = stepIndex === stepCount - 1;
  const description = (mobile ? currentStep?.mobileDescription : '') || currentStep?.description || '';

  return createPortal(
    <div className="page-tour" aria-live="polite">
      <div className="page-tour__shield" aria-hidden="true" />
      {!targetRect && <div className="page-tour__curtain is-full" aria-hidden="true" />}
      {targetRect && (
        <>
          <div className="page-tour__curtain is-top" style={{ height: targetRect.top }} aria-hidden="true" />
          <div className="page-tour__curtain is-left" style={{ top: targetRect.top, width: targetRect.left, height: targetRect.height }} aria-hidden="true" />
          <div className="page-tour__curtain is-right" style={{ top: targetRect.top, left: targetRect.right, height: targetRect.height }} aria-hidden="true" />
          <div className="page-tour__curtain is-bottom" style={{ top: targetRect.bottom }} aria-hidden="true" />
          <div
            className="page-tour__spotlight"
            style={{ left: targetRect.left, top: targetRect.top, width: targetRect.width, height: targetRect.height }}
            aria-hidden="true"
          />
        </>
      )}

      <section
        ref={dialogRef}
        className="page-tour__dialog"
        data-placement={position.placement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-tour-title"
        aria-describedby="page-tour-description"
        tabIndex={-1}
        style={position.placement === 'bottom-sheet' ? undefined : { left: position.left, top: position.top }}
      >
        <div className="page-tour__heading">
          <span className="page-tour__eyebrow"><CircleHelp size={15} aria-hidden="true" /> {tour.title}</span>
          <button type="button" className="page-tour__close" aria-label="Закрыть обучение" onClick={() => closeTour('dismissed')}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        {waiting ? (
          <div className="page-tour__state" role="status">
            <strong id="page-tour-title">Готовим подсказку…</strong>
            <p id="page-tour-description">Ждём, пока данные страницы загрузятся.</p>
          </div>
        ) : !currentStep ? (
          <div className="page-tour__state">
            <strong id="page-tour-title">На этой странице пока нечего подсветить</strong>
            <p id="page-tour-description">Обновите страницу после загрузки данных или откройте общий FAQ.</p>
            <a href="/faq" className="page-tour__faq-link">Открыть FAQ</a>
          </div>
        ) : (
          <>
            <div className="page-tour__progress-row" role="group" aria-label={`Шаг ${stepIndex + 1} из ${stepCount}, выполнено ${Math.round(((stepIndex + 1) / stepCount) * 100)} процентов`}>
              <span aria-hidden="true">Шаг {stepIndex + 1} из {stepCount}</span>
              <span aria-hidden="true">{Math.round(((stepIndex + 1) / stepCount) * 100)}%</span>
            </div>
            <div className="page-tour__progress" aria-hidden="true">
              <span style={{ width: `${((stepIndex + 1) / stepCount) * 100}%` }} />
            </div>
            <h2 id="page-tour-title">{currentStep.title}</h2>
            <p id="page-tour-description">{description}</p>
            <div className="page-tour__actions">
              <button
                type="button"
                className="page-tour__button is-back"
                disabled={stepIndex === 0}
                onClick={() => setStepIndex(index => Math.max(index - 1, 0))}
              >
                <ArrowLeft size={16} aria-hidden="true" /> Назад
              </button>
              <button
                type="button"
                className="page-tour__button is-next"
                onClick={() => {
                  if (finalStep) closeTour('completed');
                  else setStepIndex(index => Math.min(index + 1, stepCount - 1));
                }}
              >
                {finalStep ? <><Check size={16} aria-hidden="true" /> Готово</> : <>Далее <ArrowRight size={16} aria-hidden="true" /></>}
              </button>
            </div>
            {!finalStep && (
              <button type="button" className="page-tour__skip" onClick={() => closeTour('dismissed')}>
                Пропустить обучение
              </button>
            )}
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
