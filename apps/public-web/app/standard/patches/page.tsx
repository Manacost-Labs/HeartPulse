import '@/src/route-parchment.css';
import { normalizePatchVersion } from '@/src/modules/patchNotes/public';
import { loadPublicPatchNotes } from '@/apps/public-web/lib/publicPatchNotes';
import type { PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { patchNotesSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { PatchNotesPageClient } from '@/apps/public-web/ui/PatchNotesPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
const requestedVersion = (requested: string | string[] | undefined) =>
  normalizePatchVersion(Array.isArray(requested) ? requested[0] : requested) || null;

// The title names the version the page shows first (the newest, or `?version=`) and its release date;
// the patch notes reader keeps the answer, so the page's own read below is not a second request.
export const generateMetadata = seoPageMetadata('/standard/patches', 'HearthPulse — патчноуты Hearthstone',
  async query => patchNotesSeoValues(
    (await loadPublicPatchNotes(requestedVersion(new URLSearchParams(query).get('version') ?? undefined))).patches, Date.now()));

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const version = requestedVersion((await searchParams).version);
  return <>
    <SeoStructuredData path="/standard/patches" />
    <PatchNotesPageClient key={version ?? 'latest'} version={version} initial={await loadPublicPatchNotes(version)} />
  </>;
}
