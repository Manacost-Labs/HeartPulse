'use client';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import NotFoundPage from '../../../src/features/NotFoundPage';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };

export function UnknownPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="home" pathname="/404/" access={access} navigate={navigate} editorial>
    <NotFoundPage navigatePath={navigate} />
  </PublicPageShell>;
}
