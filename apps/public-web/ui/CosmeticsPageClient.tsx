'use client';

import Cosmetics from '../../../src/features/Cosmetics';
import { PublicPageShell } from '../../../src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';

const navigate = (path: string) => window.location.assign(path);

export function CosmeticsPageClient({ pathname, search }: { pathname: string; search: string }) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="cosmetics" pathname={pathname} access={access} navigate={navigate} wide>
    <Cosmetics currentPath={pathname} navigatePath={navigate} initialSearch={search} />
  </PublicPageShell>;
}
