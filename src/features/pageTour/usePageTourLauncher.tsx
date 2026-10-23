import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { PageTourAccess } from './pageTourDefinitions';
import type { PageTourLaunch } from './PageTour';
import { resolvePageTour } from './pageTourModel';
import { PAGE_TOUR_ROUTES } from './pageTourRoutes';

const LazyPageTour = lazy(() => import('./PageTour'));
const LazyPageTourInvite = lazy(() => import('./PageTourInvite'));

/**
 * Header state of the page tour: whether this page has one, the header button
 * and Help-menu launches, `?tour=1`, and the first-visit offer. A tour never
 * opens by itself: a new visitor gets one quiet offer per tab (`invite`) and
 * opens the tour from it. Only the route list ships with every page; the
 * first-visit rules are a tiny lazy chunk (pageTourAutoStart.ts) that rejects
 * crawlers, automated browsers and an opted-out visitor before the tour copy
 * or UI load.
 */
export function usePageTourLauncher({ pagePath, auth }: { pagePath: string; auth: boolean }) {
  const [launch, setLaunch] = useState<PageTourLaunch | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  // Focus returns to the control that opened the tour; an automatic tour gives it back to where it was.
  const returnRef = useRef<HTMLElement | null>(null);
  const route = resolvePageTour(pagePath, PAGE_TOUR_ROUTES);
  const tourId = route && (route.id !== 'profile' || auth) ? route.id : null;

  useEffect(() => {
    setLaunch(null);
    setInvite(null);
  }, [auth, pagePath]);

  useEffect(() => {
    if (!tourId) return undefined;
    let cancel: (() => void) | undefined;
    let active = true;
    void import('./pageTourAutoStart').then(({ startPageTourOnFirstVisit }) => {
      if (!active) return;
      cancel = startPageTourOnFirstVisit(tourId, {
        open: () => {
          returnRef.current = null;
          setLaunch(current => current ?? 'manual');
        },
        invite: storageKey => setInvite(current => current ?? storageKey),
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      cancel?.();
    };
  }, [tourId]);

  const open = useCallback((returnTo: HTMLElement | null) => {
    returnRef.current = returnTo;
    setInvite(null);
    setLaunch('manual');
  }, []);

  // The visitor asked for it, so it opens like the header button: an automatic
  // launch would close itself on a paid page where a guest sees only the
  // subscription step, and «Показать» would do nothing.
  const acceptInvite = useCallback(() => {
    returnRef.current = null;
    setInvite(null);
    setLaunch('manual');
  }, []);

  const dismissInvite = useCallback(() => setInvite(null), []);

  const close = useCallback(() => {
    setLaunch(null);
    const returnTo = returnRef.current;
    if (returnTo) window.setTimeout(() => returnTo.focus(), 0);
  }, []);

  return { available: Boolean(tourId), launch, invite, open, close, acceptInvite, dismissInvite };
}

/** The lazily loaded tour; renders nothing until a launch. */
export function PageTourLayer({ pagePath, access, launch, onClose }: {
  pagePath: string; access: PageTourAccess; launch: PageTourLaunch | null; onClose: () => void;
}) {
  if (!launch) return null;
  return (
    <Suspense fallback={null}>
      <LazyPageTour pagePath={pagePath} access={access} launch={launch} onClose={onClose} />
    </Suspense>
  );
}

/** The first-visit offer; renders nothing until one is due and while the tour itself is open. */
export function PageTourInviteLayer({ invite, launch, onAccept, onDismiss }: {
  invite: string | null; launch: PageTourLaunch | null; onAccept: () => void; onDismiss: () => void;
}) {
  if (!invite || launch) return null;
  return (
    <Suspense fallback={null}>
      <LazyPageTourInvite storageKey={invite} onAccept={onAccept} onDismiss={onDismiss} />
    </Suspense>
  );
}
