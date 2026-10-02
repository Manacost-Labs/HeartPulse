'use client';
import type { ReactNode } from 'react';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/** The page shell of the help and legal pages; their text arrives as server-rendered children. */
export function PublicSupportShell({ page, children }: { page: 'faq' | 'privacy' | 'terms'; children: ReactNode }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab={page} pathname={`/${page}/`} access={access} navigate={navigate} editorial>
    {children}
  </PublicPageShell>;
}
