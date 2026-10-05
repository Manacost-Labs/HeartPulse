'use client';
import { useCallback, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { PublicNavigationController } from '@/src/app/shell/PublicNavigationController';
import { PublicNavigationContext } from '@/src/app/shell/PublicNavigationContext';
import { tabFromPath } from '@/src/app/routing/navigationRoutes';
import { PublicNavigationBridge } from './PublicNavigationBridge';
import { PublicAccessContext, usePublicAccessState } from './usePublicAccess';
import { navigate } from './navigation';

export function PublicNavigationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const access = usePublicAccessState(pathname);
  const [updatedAt, setUpdatedAt] = useState({ pathname, label: 'Нет данных' });
  const reportUpdatedAt = useCallback((label: string) => setUpdatedAt({ pathname, label }), [pathname]);
  const publicPage = !/^\/admin(?:\/|$)/.test(pathname);
  return <PublicAccessContext.Provider value={access}>
    <PublicNavigationBridge />
    <PublicNavigationContext.Provider value={publicPage ? reportUpdatedAt : null}>
      {publicPage && <>
        <a className="arena-skip-link" href="#main-content">К основному содержимому</a>
        <PublicNavigationController activeTab={tabFromPath(pathname)} pathname={pathname} access={access} navigate={navigate}
          updatedAtLabel={updatedAt.pathname === pathname ? updatedAt.label : 'Нет данных'} />
      </>}
      {children}
    </PublicNavigationContext.Provider>
  </PublicAccessContext.Provider>;
}
