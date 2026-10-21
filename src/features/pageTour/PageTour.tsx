import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Tour, type TourStep } from '../../vendor/valyro-ui/feedback/Tour';
import { PortalContainerContext } from '../../vendor/valyro-ui/primitives/Portal';
import '../../vendor/varylo-ui/styles/index.css';
import '../../shared/ui/varyloParchment.css';
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
  restorePageTourStepIndex,
  resolvePageTour,
  shouldWaitForRestoredTourStep,
  planTourStep,
  type PageTourStepProgress,
} from './pageTourModel';
import { writeAutoTourOptOut } from './pageTourAutoStart';
import PageTourMedia from './PageTourMedia';
import './PageTour.css';

export type PageTourLaunch = 'manual' | 'auto';

type PageTourProps = {
  pagePath: string;
  access: PageTourAccess;
  /** `auto` stays invisible until a step can be shown and closes silently when none appears. */
  launch?: PageTourLaunch;
  onClose: () => void;
};

type Phase = 'waiting' | 'ready' | 'empty';

const MOBILE_QUERY = '(max-width: 760px), (max-height: 520px), (pointer: coarse) and (max-width: 900px)';
const DISCOVERY_TIMEOUT_MS = 8_000;
const SHEET_GAP = 12;
/** Valyro's default `spotlightPadding`. */
const SPOTLIGHT_PADDING = 8;
/** Height of a step explainer with its margins (PageTour.css `.ui-tour__media`). */
const MEDIA_HEIGHT = 121;

const TOUR_LABELS = {
  next: 'Далее',
  back: 'Назад',
  finish: 'Готово',
  skip: 'Закрыть обучение',
  progress: (current: number, total: number) => `Шаг ${current} из ${total}`,
};

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

function paywallStep(tour: PageTourDefinition): PageTourStep {
  const isStandard = tour.id.startsWith('standard-') || tour.id.startsWith('constructed-');
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

function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Sticky and fixed bars at the top (the utility header, the phone app bar) cover the top of the viewport. */
function safeTop(): number {
  let bottom = 0;
  for (const element of document.querySelectorAll<HTMLElement>('header, nav, [class*="header"], [class*="topbar"]')) {
    const { position } = window.getComputedStyle(element);
    if (position !== 'sticky' && position !== 'fixed') continue;
    const rect = element.getBoundingClientRect();
    if (rect.top <= 1 && rect.bottom > 0 && rect.height < viewportHeight() / 3) bottom = Math.max(bottom, rect.bottom);
  }
  return Math.max(16, Math.round(bottom) + 12);
}

function stateStep(phase: Exclude<Phase, 'ready'>): TourStep {
  if (phase === 'waiting') {
    return {
      title: 'Секунду…',
      content: <div className="page-tour__state" role="status"><p>Готовим подсказку: ждём, пока данные страницы загрузятся.</p></div>,
    };
  }
  return {
    title: 'На этой странице пока нечего подсветить',
    content: (
      <div className="page-tour__state">
        <p>Обновите страницу после загрузки данных или откройте общий FAQ.</p>
        <a href="/faq/" className="page-tour__faq-link">Открыть FAQ</a>
      </div>
    ),
  };
}

/**
 * Page walkthrough on the vendored Valyro Tour. This wrapper owns what the
 * kit cannot know: which `data-tour-id` anchors are rendered for this visitor,
 * waiting for late data, the subscription fallback step, saved progress, the
 * phone bottom sheet and the inert application root behind the dialog.
 */
export default function PageTour({ pagePath, access, launch = 'manual', onClose }: PageTourProps) {
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
  const [phase, setPhase] = useState<Phase>('waiting');
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  const [largeTarget, setLargeTarget] = useState(false);
  const [cardHeight, setCardHeight] = useState(260);
  // The card without its explainer: steps differ only by the picture, so the next card's height is predictable.
  const [textHeight, setTextHeight] = useState(260);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null);
  const restoredRef = useRef(false);
  const currentIdRef = useRef<string | null>(null);

  const currentStep = phase === 'ready' ? steps[stepIndex] ?? null : null;
  const sheet = mobile || largeTarget;
  const currentStepId = currentStep?.id;

  const finish = useCallback((status: PageTourStepProgress['status']) => {
    if (tour) writeProgress(tour, { status, stepId: currentStepId });
    onClose();
  }, [currentStepId, onClose, tour]);

  // Portaled layers render into a host that carries the parchment token mapping.
  useLayoutEffect(() => {
    const element = document.createElement('div');
    element.className = 'page-tour-host hp-varylo-parchment';
    document.body.appendChild(element);
    setHost(element);
    return () => element.remove();
  }, []);

  useEffect(() => {
    if (!tour) {
      onClose();
      return undefined;
    }
    let timedOut = false;
    const main = document.getElementById('main-content') ?? document.body;
    const refresh = () => {
      const eligibleStepIds = tour.steps.filter(step => isTourStepEligible(step, access)).map(step => step.id);
      const nextSteps = resolveSteps(tour, access);
      setSteps(previous => (
        previous.length === nextSteps.length && previous.every((step, index) => step.id === nextSteps[index]?.id)
          ? previous
          : nextSteps
      ));
      const waitingForRestoredStep = !restoredRef.current && shouldWaitForRestoredTourStep(
        storedProgress,
        eligibleStepIds,
        nextSteps.map(step => step.id),
      );
      // A first launch for a guest only explains the subscription block; that is an advert, not a walkthrough.
      const autoUseless = launch === 'auto' && (nextSteps.length === 0 || nextSteps[0]?.id === 'paywall');
      if (nextSteps.length > 0 && (!waitingForRestoredStep || timedOut) && !autoUseless) setPhase('ready');
      else if (timedOut) setPhase(nextSteps.length > 0 && !autoUseless ? 'ready' : 'empty');
    };
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'aria-hidden'] });
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      refresh();
    }, DISCOVERY_TIMEOUT_MS);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeoutId);
    };
  }, [access, launch, onClose, storedProgress, tour]);

  useEffect(() => {
    if (phase === 'empty' && launch === 'auto') onClose();
  }, [launch, onClose, phase]);

  useEffect(() => {
    if (phase !== 'ready' || steps.length === 0) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      setStepIndex(launch === 'auto' ? 0 : restorePageTourStepIndex(storedProgress, steps.map(step => step.id)));
      return;
    }
    const previousId = currentIdRef.current;
    const nextIndex = previousId ? steps.findIndex(step => step.id === previousId) : -1;
    setStepIndex(index => nextIndex >= 0 ? nextIndex : Math.min(index, steps.length - 1));
  }, [launch, phase, steps, storedProgress]);

  useEffect(() => {
    currentIdRef.current = currentStepId ?? null;
    if (tour && currentStepId && restoredRef.current) writeProgress(tour, { status: 'in-progress', stepId: currentStepId });
  }, [currentStepId, tour]);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // The bottom targets need room to scroll above the sheet.
  useLayoutEffect(() => {
    const body = document.body;
    const previousPaddingBottom = body.style.paddingBottom;
    const currentPaddingBottom = Number.parseFloat(window.getComputedStyle(body).paddingBottom) || 0;
    body.style.paddingBottom = `${currentPaddingBottom + Math.ceil(cardHeight + 48)}px`;
    return () => { body.style.paddingBottom = previousPaddingBottom; };
  }, [cardHeight]);

  const visible = phase === 'ready' || launch === 'manual';

  useEffect(() => {
    if (!card) return undefined;
    const update = () => {
      const height = card.getBoundingClientRect().height;
      setCardHeight(height);
      setTextHeight(height - (card.querySelector('.ui-tour__media')?.getBoundingClientRect().height ?? 0));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  // `.page-tour` on the host marks an open tour for page styles: the Battlegrounds
  // builder shows every panel on phones while one is open (builderWorkbench.css).
  useEffect(() => {
    if (!visible || !host) return undefined;
    host.classList.add('page-tour');
    return () => host.classList.remove('page-tour');
  }, [host, visible]);

  useEffect(() => {
    if (!visible) return undefined;
    const root = document.getElementById('root');
    const rootWasInert = root?.inert ?? false;
    if (root) root.inert = true;
    return () => {
      if (root) root.inert = rootWasInert;
    };
  }, [visible]);

  useEffect(() => () => {
    previousFocusRef.current?.focus({ preventScroll: true });
  }, []);

  const targetRef = useRef<Element | null>(null);
  const planFor = useCallback((element: Element, nextCardHeight: number, forceSheet: boolean) => {
    const rect = element.getBoundingClientRect();
    const height = viewportHeight();
    return planTourStep({
      // The spotlight ring is drawn SPOTLIGHT_PADDING outside the target.
      target: {
        left: rect.left - SPOTLIGHT_PADDING,
        top: rect.top - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      },
      card: { width: 372, height: mobile ? Math.min(nextCardHeight, height * 0.5) : nextCardHeight },
      viewport: { width: document.documentElement.clientWidth, height },
      safeTop: safeTop(),
      forceSheet,
    });
  }, [mobile]);

  // Planned before the card exists, from the height of the previous card and this step's picture.
  const scrollTarget = useCallback((element: Element) => {
    targetRef.current = element;
    const step = steps.find(item => element.matches(`[data-tour-id="${CSS.escape(item.target)}"]`));
    const plan = planFor(element, Math.max(textHeight, 200) + (step?.media && !mobile ? MEDIA_HEIGHT : 0), mobile);
    setLargeTarget(plan.mode === 'sheet' && !mobile);
    if (plan.scrollBy) window.scrollBy({ top: plan.scrollBy, behavior: plan.mode === 'sheet' || reducedMotion() ? 'auto' : 'smooth' });
  }, [mobile, planFor, steps, textHeight]);

  // A longer text than predicted: re-plan with the rendered card. It only ever docks the card, so it cannot oscillate.
  useEffect(() => {
    const element = targetRef.current;
    if (!element?.isConnected || phase !== 'ready') return;
    const plan = planFor(element, cardHeight, mobile || largeTarget);
    if (plan.mode === 'sheet' && !mobile && !largeTarget) setLargeTarget(true);
    if (plan.scrollBy) window.scrollBy({ top: plan.scrollBy, behavior: 'auto' });
  }, [cardHeight, largeTarget, mobile, phase, planFor]);

  const tourSteps = useMemo<TourStep[]>(() => {
    if (phase !== 'ready') return [stateStep(phase)];
    return steps.map(step => ({
      target: () => visibleTarget(step.target),
      title: step.title,
      content: <p>{(mobile ? step.mobileDescription : '') || step.description}</p>,
      media: step.media && !mobile ? <PageTourMedia kind={step.media} /> : undefined,
      placement: step.preferredPlacement ?? 'bottom',
    }));
  }, [mobile, phase, steps]);

  if (!tour || !host || !visible) return null;

  const finalStep = phase === 'ready' && stepIndex === steps.length - 1;
  const tourKey = phase === 'ready' ? `ready:${steps.map(step => step.id).join(',')}` : phase;

  return (
    <PortalContainerContext.Provider value={host}>
      <Tour
        key={tourKey}
        ref={setCard}
        open
        steps={tourSteps}
        step={phase === 'ready' ? stepIndex : 0}
        onStepChange={setStepIndex}
        onFinish={() => finish(phase === 'ready' ? 'completed' : 'dismissed')}
        onSkip={() => finish('dismissed')}
        labels={TOUR_LABELS}
        showProgress={phase === 'ready'}
        sheet={sheet}
        spotlightInsets={{ top: 4, bottom: sheet ? cardHeight + SHEET_GAP : 4 }}
        scrollTarget={scrollTarget}
        className="page-tour__dialog"
        data-placement={sheet ? 'bottom-sheet' : 'popover'}
        data-phase={phase}
        data-launch={launch}
        footer={phase === 'ready' ? (
          <div className="page-tour__footer">
            <span className="page-tour__links">
              {!finalStep && (
                <button type="button" className="page-tour__skip" onClick={() => finish('dismissed')}>
                  Пропустить
                </button>
              )}
              <button
                type="button"
                className="page-tour__skip is-never"
                onClick={() => {
                  writeAutoTourOptOut();
                  finish('dismissed');
                }}
              >
                Больше не показывать
              </button>
            </span>
          </div>
        ) : undefined}
      />
    </PortalContainerContext.Provider>
  );
}
