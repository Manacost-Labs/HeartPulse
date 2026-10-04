'use client';

import Cosmetics from '@/src/features/Cosmetics';
import type { CosmeticsCatalogSeed, DetailPayload } from '@/src/features/Cosmetics';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

export function CosmeticsPageClient({ pathname, search, initialDetail, initialCatalog }: {
  pathname: string; search: string; initialDetail?: DetailPayload; initialCatalog?: CosmeticsCatalogSeed | null;
}) {
  const access = usePublicAccess();
  return <PublicPageShell activeTab="cosmetics" pathname={pathname} access={access} navigate={navigate} wide>
    <Cosmetics currentPath={pathname} navigatePath={navigate} initialSearch={search} initialDetail={initialDetail}
      initialCatalog={initialCatalog} />
  </PublicPageShell>;
}
