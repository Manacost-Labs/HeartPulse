'use client';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import NotFoundPage from '@/src/features/NotFoundPage';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function UnknownPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname="/404/" access={access} navigate={navigate} editorial>
    <NotFoundPage navigatePath={navigate} />
  </PublicPageShell>;
}
