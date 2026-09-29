'use client';

import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { DeveloperApiPage } from '@/src/modules/developerApi/public';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function DeveloperApiPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="developer-api" pathname="/developers/api/" access={access} navigate={navigate} editorial>
    <DeveloperApiPage />
  </PublicPageShell>;
}
