import '@/src/route-parchment.css';
import { normalizePatchVersion } from '@/src/modules/patchNotes/public';
import { loadPublicPatchNotes } from '@/apps/public-web/lib/publicPatchNotes';
import type { PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { PatchNotesPageClient } from '@/apps/public-web/ui/PatchNotesPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/patches', 'HearthPulse — патчноуты Hearthstone');

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const requested = (await searchParams).version;
  const version = normalizePatchVersion(Array.isArray(requested) ? requested[0] : requested) || null;
  return <>
    <SeoStructuredData path="/standard/patches" />
    <PatchNotesPageClient key={version ?? 'latest'} version={version} initial={await loadPublicPatchNotes(version)} />
  </>;
}
