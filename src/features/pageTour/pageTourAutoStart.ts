import { pageTourStorageKey } from './pageTourModel';

/**
 * First-visit rules for page tours, loaded lazily by the header. It touches
 * no tour copy: crawlers, automated browsers and visitors who chose «Больше не
 * показывать» never load the tour definitions or UI.
 */

/** «Больше не показывать»: no tour starts by itself on any page; the header button still opens one. */
export const AUTO_TOUR_OPT_OUT_KEY = 'manacost:page-tours:auto-off';

/**
 * sessionStorage flag: this browser tab has already been offered a tour. A
 * visitor who browses several pages gets one quiet offer, not one per page.
 */
export const TOUR_INVITE_SESSION_KEY = 'manacost:page-tours:invited';

/** How long a visitor reads the page before the offer appears. */
export const TOUR_INVITE_DELAY_MS = 6_000;

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
  /** Without a session store the once-per-tab rule is not enforced. */
  session?: StorageReader | null;
  storageKey?: string;
  userAgent: string;
  webdriver: boolean;
  search: string;
}): boolean {
  const { storage, session, storageKey, userAgent, webdriver, search } = options;
  if (!storage || isAutomatedVisitor(userAgent, webdriver) || pageTourQueryIntent(search) === 'never') return false;
  try {
    if (session?.getItem(TOUR_INVITE_SESSION_KEY) === '1') return false;
    return storage.getItem(AUTO_TOUR_OPT_OUT_KEY) !== '1' && (!storageKey || storage.getItem(storageKey) === null);
  } catch {
    return false;
  }
}

function markInvitedThisSession(session: Storage | null): void {
  try {
    session?.setItem(TOUR_INVITE_SESSION_KEY, '1');
  } catch {
    // Without session storage the next page may offer its own tour once more.
  }
}

/** «Не сейчас» on the offer: this page and tour version never offers itself again; the header button still opens it. */
export function writeTourInviteDeclined(storageKey: string): void {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ status: 'dismissed' }));
  } catch {
    // Without storage the choice lasts for this page view only.
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
export function whenPageIdle(task: () => void, delay = TOUR_INVITE_DELAY_MS): () => void {
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
 * `?tour=1` opens the tour at once. Otherwise an eligible visitor is offered
 * it, not shown it: after load, a reading pause and idle, a small non-modal
 * card asks first (`invite`). The version-specific key needs the definitions,
 * so they load only for a visitor who passed the cheap checks. Returns a
 * cancel function.
 */
export function startPageTourOnFirstVisit(
  tourId: string,
  handlers: { open: () => void; invite: (storageKey: string) => void },
): () => void {
  if (pageTourQueryIntent(window.location.search) === 'open') {
    handlers.open();
    return () => undefined;
  }
  let storage: Storage | null = null;
  let session: Storage | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  try { session = window.sessionStorage; } catch { session = null; }
  const visitor = { storage, session, userAgent: navigator.userAgent, webdriver: navigator.webdriver === true, search: window.location.search };
  if (!shouldAutoStartPageTour(visitor)) return () => undefined;
  let active = true;
  const cancelIdle = whenPageIdle(() => {
    void import('./pageTourDefinitions').then(({ PAGE_TOURS }) => {
      const tour = PAGE_TOURS.find(item => item.id === tourId);
      if (!active || !tour || document.visibilityState !== 'visible') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const storageKey = pageTourStorageKey(tour);
      if (!shouldAutoStartPageTour({ ...visitor, storageKey })) return;
      markInvitedThisSession(session);
      handlers.invite(storageKey);
    }).catch(() => undefined);
  });
  return () => {
    active = false;
    cancelIdle();
  };
}
