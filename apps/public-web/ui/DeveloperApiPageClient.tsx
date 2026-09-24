'use client';

import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { DeveloperApiPage } from '../../../src/modules/developerApi/public';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => { window.location.assign(path); };

export function DeveloperApiPageClient() {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="developer-api" pathname="/developers/api/" access={access} navigate={navigate} editorial>
    <DeveloperApiPage />
  </PublicPageShell>;
}
