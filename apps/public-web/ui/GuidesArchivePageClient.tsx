'use client';

import GuidesArchive from '@/src/features/GuidesArchive';
import type { GuidesArchiveResponse } from '@/src/features/GuidesArchiveData';
import { PublicPageShell } from '@/src/app/shell/PublicPageShell';
import { paidAccess, usePublicAccess } from './usePublicAccess';
import { navigate } from './navigation';

/**
 * One archive list for everyone. `initial` is the first page the server read from the open list: guests, robots and
 * subscribers get the same cards, filters and search; only the search of a viewer without access skips the paid text.
 */
export function GuidesArchivePageClient({ initial }: { initial: GuidesArchiveResponse | null }) {
  const access = usePublicAccess();
  const { allowed } = paidAccess(access, 'guidesArchive');
  return <PublicPageShell activeTab="guides-archive" pathname="/guides-archive/" parchmentPreload="tablet-up"
    access={access} navigate={navigate} wide>
    <GuidesArchive currentPath="/guides-archive/" navigatePath={navigate} hasAccess={allowed} initialList={initial} />
  </PublicPageShell>;
}
