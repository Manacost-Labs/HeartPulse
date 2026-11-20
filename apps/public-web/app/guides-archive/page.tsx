import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import { GuidesArchivePageClient } from '@/apps/public-web/ui/GuidesArchivePageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicGuidesPageList } from '@/apps/public-web/lib/publicGuidesList';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the first page of the open list is read here from Express's anonymous
// projection and rendered for everyone; filters and paging load in the browser. nginx sends query robots as
// X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/guides-archive', 'HearthPulse — архив гайдов');

export default async function Page() {
  const list = await loadPublicGuidesPageList();
  return <>
    <SeoStructuredData path="/guides-archive" />
    <GuidesArchivePageClient initial={list} />
  </>;
}
