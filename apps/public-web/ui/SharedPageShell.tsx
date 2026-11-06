'use client';
import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/**
 * The site shell (menu, header, parchment) of pages people share by link: a replay, the year in review, the download
 * landing. Their content is server-rendered and arrives as children; no menu item is active.
 */
export function SharedPageShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname={pathname} account access={access} navigate={navigate}>
    {children}
  </PublicPageShell>;
}
