import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { PageTourAccess } from './pageTourDefinitions';
import type { PageTourLaunch } from './PageTour';
import { resolvePageTour } from './pageTourModel';
import { PAGE_TOUR_ROUTES } from './pageTourRoutes';

const LazyPageTour = lazy(() => import('./PageTour'));

/**
 * Header state of the page tour: whether this page has one, the header button
 * and Help-menu launches, `?tour=1`, and the once-per-page first visit. Only
 * the route list ships with every page; the first-visit rules are a tiny lazy
 * chunk (pageTourAutoStart.ts) that rejects crawlers, automated browsers and
 * an opted-out visitor before the tour copy or UI load.
 */
export function usePageTourLauncher({ pagePath, auth }: { pagePath: string; auth: boolean }) {
  const [launch, setLaunch] = useState<PageTourLaunch | null>(null);
  // Focus returns to the control that opened the tour; an automatic tour gives it back to where it was.
  const returnRef = useRef<HTMLElement | null>(null);
  const route = resolvePageTour(pagePath, PAGE_TOUR_ROUTES);
  const tourId = route && (route.id !== 'profile' || auth) ? route.id : null;

  useEffect(() => { setLaunch(null); }, [auth, pagePath]);

  useEffect(() => {
    if (!tourId) return undefined;
    let cancel: (() => void) | undefined;
    let active = true;
    void import('./pageTourAutoStart').then(({ startPageTourOnFirstVisit }) => {
      if (!active) return;
      cancel = startPageTourOnFirstVisit(tourId, kind => {
        returnRef.current = null;
        setLaunch(current => current ?? kind);
      });
    }).catch(() => undefined);
    return () => {
      active = false;
      cancel?.();
    };
  }, [tourId]);

  const open = useCallback((returnTo: HTMLElement | null) => {
    returnRef.current = returnTo;
    setLaunch('manual');
  }, []);

  const close = useCallback(() => {
    setLaunch(null);
    const returnTo = returnRef.current;
    if (returnTo) window.setTimeout(() => returnTo.focus(), 0);
  }, []);

  return { available: Boolean(tourId), launch, open, close };
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
