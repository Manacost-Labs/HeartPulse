import { flushSync } from 'react-dom';
import { shouldHandleClientNavigation } from './clientNavigation';
import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPageMeta,
  isKnownPath,
  preloadRouteModule,
  routePath,
  tabFromPath,
  type TabId,
} from './routeManifest';
import {
  clientRouteView,
  historyRouteKnowledge,
  initialClientRouteResolution,
  normalizeClientRoutePath,
  settledClientRouteResolution,
  shouldPreserveInitialServerMeta,
  withHistoryRouteKnowledge,
} from './routeResolution';

const bootstrapRouteRoot = globalThis.document?.getElementById('root');
const initialServerRouteStatus = bootstrapRouteRoot?.dataset.routeStatus;
const initialServerMetaHint = initialServerRouteStatus
  ? normalizeClientRoutePath(globalThis.location.pathname)
  : null;
delete bootstrapRouteRoot?.dataset.routeStatus;

export type ApplicationNavigation = {
  activeTab: TabId;
  currentPath: string;
  locationSearch: string;
  navigate: (tab: TabId) => void;
  navigateLogin: () => void;
  navigatePath: (path: string) => void;
  routeView: ReturnType<typeof clientRouteView>;
};

function commitRouteUpdate(update: () => void) {
    const startViewTransition = (document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    }).startViewTransition;
    if (startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // The browser captures the destination frame when this callback returns.
      // React's concurrent transition may commit later, which causes a flash.
      startViewTransition.call(document, () => flushSync(update));
      return;
    }
    startTransition(update);
}

function useDocumentNavigation(navigateLocation: (destination: URL) => void) {
useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const destination = shouldHandleClientNavigation({
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        origin: window.location.origin,
      });
      if (!destination || !isKnownPath(destination.pathname)) return;
      event.preventDefault();
      navigateLocation(destination);
    };
    document.addEventListener('click', onDocumentClick);
    return () => document.removeEventListener('click', onDocumentClick);
  }, [navigateLocation]);
}

export function useApplicationNavigation(
  onNavigation?: () => void,
): ApplicationNavigation {
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromPath(window.location.pathname));
  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [routeResolution, setRouteResolution] = useState(() => initialClientRouteResolution(
    window.location.pathname,
    initialServerRouteStatus === '404' ? initialServerMetaHint : null,
  ));
  const routeView = clientRouteView(routeResolution, currentPath);
  const initialMetaPassRef = useRef(true);

  useEffect(() => {
    const known = routeView === 'known' ? true : routeView === 'not-found' ? false : null;
    if (known === null || historyRouteKnowledge(window.history.state) === known) return;
    window.history.replaceState(withHistoryRouteKnowledge(window.history.state, known), '');
  }, [routeView]);

  useEffect(() => {
    let active = true;
    const preserveInitialServerMeta = shouldPreserveInitialServerMeta(
      currentPath,
      initialServerMetaHint,
      initialMetaPassRef.current,
    );
    const isInitialPlainHome = initialMetaPassRef.current
      && activeTab === 'home'
      && currentPath === '/'
      && locationSearch === '';
    initialMetaPassRef.current = false;
    if (isInitialPlainHome || preserveInitialServerMeta) return undefined;
    void applyPageMeta(activeTab, currentPath, locationSearch)
      .then(policy => {
        if (!active) return;
        // Ignore policy results for a page left during the async metadata load.
        if (normalizeClientRoutePath(window.location.pathname) !== policy.normalizedPathname) return;
        setRouteResolution(settledClientRouteResolution(policy.normalizedPathname, policy.known));
      })
      .catch(() => {
        if (active) {
          setRouteResolution(previous => clientRouteView(previous, currentPath) === 'not-found'
            ? previous
            : { pathname: normalizeClientRoutePath(currentPath), status: 'unavailable' });
        }
      });
    return () => { active = false; };
  }, [activeTab, currentPath, locationSearch]);



const navigateLocation = useCallback((destination: URL, tabOverride?: TabId) => {
    const pathname = destination.pathname.startsWith('/') ? destination.pathname : `/${destination.pathname}`;
    const tab = tabOverride ?? tabFromPath(pathname);
    preloadRouteModule(tab);
    if (
      window.location.pathname !== pathname
      || window.location.search !== destination.search
      || window.location.hash !== destination.hash
    ) {
      window.history.pushState({ tab, routeKnown: true }, '', `${pathname}${destination.search}${destination.hash}`);
    }
    const updateRoute = () => {
      setRouteResolution(settledClientRouteResolution(pathname, true));
      setLocationSearch(destination.search);
      setCurrentPath(pathname);
      setActiveTab(tab);
      onNavigation?.();
    };
    commitRouteUpdate(updateRoute);
    if (destination.hash) {
      requestAnimationFrame(() => document.getElementById(decodeURIComponent(destination.hash.slice(1)))?.scrollIntoView());
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [commitRouteUpdate, onNavigation]);

const navigate = useCallback((tab: TabId) => {
    const slug = routePath(tab);
    navigateLocation(new URL(slug, window.location.origin));
  }, [navigateLocation]);

const navigatePath = useCallback((path: string) => {
    navigateLocation(new URL(path, window.location.origin));
  }, [navigateLocation]);

const navigateLogin = useCallback(() => {
    preloadRouteModule('login');
    navigateLocation(new URL('/?login', window.location.origin), activeTab);
  }, [activeTab, navigateLocation]);

  useDocumentNavigation(navigateLocation);

  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const tab = event.state?.tab ?? tabFromPath(window.location.pathname);
      const known = historyRouteKnowledge(event.state);
      startTransition(() => {
        if (known !== null) {
          setRouteResolution(settledClientRouteResolution(window.location.pathname, known));
        }
        setLocationSearch(window.location.search);
        setCurrentPath(window.location.pathname);
        setActiveTab(tab);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return {
    activeTab,
    currentPath,
    locationSearch,
    navigate,
    navigateLogin,
    navigatePath,
    routeView,
  };
}
