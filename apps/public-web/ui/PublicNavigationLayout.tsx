'use client';
import { useCallback, useMemo, useOptimistic, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PublicNavigationController } from '@/src/app/shell/PublicNavigationController';
import { PublicNavigationContext } from '@/src/app/shell/PublicNavigationContext';
import { tabFromPath } from '@/src/app/routing/navigationRoutes';
import { RouteTransition } from '@/src/shared/ui/RouteTransition';
import { PublicNavigationBridge } from './PublicNavigationBridge';
import { PublicAccessContext, usePublicAccessState, usePublicAccessStore } from './usePublicAccess';
import { navigate } from './navigation';
import { useLocationSearch } from '@/src/shared/navigation/locationSearch';

export function PublicNavigationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The query names the format of a Standard page (`?format=wild`), so the menu follows it like the path; null until the browser reads it.
  const search = useLocationSearch();
  // The chosen destination is marked current at once; the committed route replaces it.
  const [shown, showDestination] = useOptimistic(useMemo(() => ({ path: pathname, search }), [pathname, search]));
  // A destination that waits for its own prefetch is marked current meanwhile.
  const [joining, setJoining] = useState<{ path: string; search: string | null } | null>(null);
  const destination = joining ?? shown;
  const onNavigationStart = useCallback((path: string, query: string) => showDestination({ path, search: query }), [showDestination]);
  const onJoining = useCallback((path: string | null, query = '') => setJoining(path === null ? null : { path, search: query }), []);
  const access = usePublicAccessState(pathname);
  const accessStore = usePublicAccessStore(access);
  const [updatedAt, setUpdatedAt] = useState({ pathname, label: 'Нет данных' });
  const reportUpdatedAt = useCallback((label: string) => setUpdatedAt({ pathname, label }), [pathname]);
  const publicPage = !/^\/admin(?:\/|$)/.test(pathname);
  return <PublicAccessContext.Provider value={accessStore}>
    <PublicNavigationContext.Provider value={publicPage ? reportUpdatedAt : null}>
      {publicPage && <>
        <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
        <PublicNavigationController activeTab={tabFromPath(destination.path)} location={destination} pathname={pathname} access={access} navigate={navigate}
          updatedAtLabel={updatedAt.pathname === pathname ? updatedAt.label : 'Нет данных'} />
      </>}
      <PublicNavigationBridge onNavigationStart={onNavigationStart} onJoining={onJoining} routeKey={pathname} />
      <RouteTransition routeKey={pathname}>{children}</RouteTransition>
    </PublicNavigationContext.Provider>
  </PublicAccessContext.Provider>;
}
