'use client';
import { useCallback, useOptimistic, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PublicNavigationController } from '@/src/app/shell/PublicNavigationController';
import { PublicNavigationContext } from '@/src/app/shell/PublicNavigationContext';
import { tabFromPath } from '@/src/app/routing/navigationRoutes';
import { RouteTransition } from '@/src/shared/ui/RouteTransition';
import { PublicNavigationBridge } from './PublicNavigationBridge';
import { PublicAccessContext, usePublicAccessState, usePublicAccessStore } from './usePublicAccess';
import { navigate } from './navigation';

export function PublicNavigationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The chosen destination is marked current at once; the committed route replaces it.
  const [shownPathname, showPathname] = useOptimistic(pathname);
  const access = usePublicAccessState(pathname);
  const accessStore = usePublicAccessStore(access);
  const [updatedAt, setUpdatedAt] = useState({ pathname, label: 'Нет данных' });
  const reportUpdatedAt = useCallback((label: string) => setUpdatedAt({ pathname, label }), [pathname]);
  const publicPage = !/^\/admin(?:\/|$)/.test(pathname);
  return <PublicAccessContext.Provider value={accessStore}>
    <PublicNavigationContext.Provider value={publicPage ? reportUpdatedAt : null}>
      {publicPage && <>
        <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
        <PublicNavigationController activeTab={tabFromPath(shownPathname)} pathname={pathname} access={access} navigate={navigate}
          updatedAtLabel={updatedAt.pathname === pathname ? updatedAt.label : 'Нет данных'} />
      </>}
      <PublicNavigationBridge onNavigationStart={showPathname} />
      <RouteTransition routeKey={pathname}>{children}</RouteTransition>
    </PublicNavigationContext.Provider>
  </PublicAccessContext.Provider>;
}
