import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPageMeta,
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

  const commitNavigation = useCallback((path: string, tab: TabId, search = '', login = false) => {
    if (window.location.pathname !== path
      || window.location.search !== search
      || window.location.hash) {
      window.history.pushState(
        login ? { tab, login: true, routeKnown: true } : { tab, routeKnown: true },
        '',
        `${path}${search}`,
      );
    }
    startTransition(() => {
      setRouteResolution(settledClientRouteResolution(path, true));
      setLocationSearch(search);
      setCurrentPath(path);
      setActiveTab(tab);
      onNavigation?.();
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [onNavigation]);

  const navigate = useCallback((tab: TabId) => {
    preloadRouteModule(tab);
    commitNavigation(routePath(tab), tab);
  }, [commitNavigation]);

  const navigatePath = useCallback((path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const tab = tabFromPath(normalizedPath);
    preloadRouteModule(tab);
    commitNavigation(normalizedPath, tab);
  }, [commitNavigation]);

  const navigateLogin = useCallback(() => {
    preloadRouteModule('login');
    commitNavigation('/', activeTab, '?login', true);
  }, [activeTab, commitNavigation]);

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
