import { pageTourStorageKey } from './pageTourModel';

/**
 * First-visit rules for page tours, loaded lazily by the header. It touches
 * no tour copy: crawlers, automated browsers and visitors who chose «Больше не
 * показывать» never load the tour definitions or UI.
 */

/** «Больше не показывать»: no tour starts by itself on any page; the header button still opens one. */
export const AUTO_TOUR_OPT_OUT_KEY = 'manacost:page-tours:auto-off';

const BOT_USER_AGENT = /bot|crawl|spider|slurp|lighthouse|headless|facebookexternalhit|embedly|preview/i;

type StorageReader = Pick<Storage, 'getItem'>;

export function isAutomatedVisitor(userAgent: string, webdriver: boolean): boolean {
  return webdriver || BOT_USER_AGENT.test(userAgent);
}

/** `?tour=1` opens the tour of the page, e.g. from a link in a guide; `?tour=0` keeps it closed. */
export function pageTourQueryIntent(search: string): 'open' | 'never' | null {
  const value = new URLSearchParams(search).get('tour');
  if (value === '1') return 'open';
  if (value === '0') return 'never';
  return null;
}

/**
 * A tour starts by itself once per page and tour version: any saved progress
 * (finished, skipped or left half-way) means the visitor has already seen it.
 * Without `storageKey` only the visitor-wide rules are checked.
 */
export function shouldAutoStartPageTour(options: {
  storage: StorageReader | null;
  storageKey?: string;
  userAgent: string;
  webdriver: boolean;
  search: string;
}): boolean {
  const { storage, storageKey, userAgent, webdriver, search } = options;
  if (!storage || isAutomatedVisitor(userAgent, webdriver) || pageTourQueryIntent(search) === 'never') return false;
  try {
    return storage.getItem(AUTO_TOUR_OPT_OUT_KEY) !== '1' && (!storageKey || storage.getItem(storageKey) === null);
  } catch {
    return false;
  }
}

export function writeAutoTourOptOut(): void {
  try {
    window.localStorage.setItem(AUTO_TOUR_OPT_OUT_KEY, '1');
  } catch {
    // Without storage the choice lasts for this page view only.
  }
}

/** Runs `task` once the page has loaded and the main thread is idle, never before `delay` ms after load. */
export function whenPageIdle(task: () => void, delay = 1_500): () => void {
  let cancelled = false;
  let timer = 0;
  let idle = 0;
  const run = () => {
    if (cancelled) return;
    timer = window.setTimeout(() => {
      if (cancelled) return;
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => { if (!cancelled) task(); }, { timeout: 3_000 });
      else task();
    }, delay);
  };
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener('load', run);
    window.clearTimeout(timer);
    if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle);
  };
}

/**
 * `?tour=1` opens the tour at once; otherwise an eligible visitor gets it after
 * load and idle. The version-specific key needs the definitions, so they load
 * only for a visitor who passed the cheap checks. Returns a cancel function.
 */
export function startPageTourOnFirstVisit(tourId: string, start: (launch: 'manual' | 'auto') => void): () => void {
  if (pageTourQueryIntent(window.location.search) === 'open') {
    start('manual');
    return () => undefined;
  }
  let storage: Storage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const visitor = { storage, userAgent: navigator.userAgent, webdriver: navigator.webdriver === true, search: window.location.search };
  if (!shouldAutoStartPageTour(visitor)) return () => undefined;
  let active = true;
  const cancelIdle = whenPageIdle(() => {
    void import('./pageTourDefinitions').then(({ PAGE_TOURS }) => {
      const tour = PAGE_TOURS.find(item => item.id === tourId);
      if (!active || !tour || document.visibilityState !== 'visible') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (shouldAutoStartPageTour({ ...visitor, storageKey: pageTourStorageKey(tour) })) start('auto');
    }).catch(() => undefined);
  });
  return () => {
    active = false;
    cancelIdle();
  };
}
