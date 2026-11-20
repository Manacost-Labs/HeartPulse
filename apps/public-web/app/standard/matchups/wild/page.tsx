import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMatchupsPageClient } from '@/apps/public-web/ui/StandardMatchupsPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { loadPublicStandardMatchups } from '@/apps/public-web/lib/publicStandardMatchups';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// The same prerendered guest view as /standard/matchups/, for the Wild format: its own address, title,
// canonical and open slice, so a crawler and a guest read one HTML. A query parameter would make the page
// dynamic and take it out of ISR and the edge cache; a path does not.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/matchups/wild', 'HearthPulse — матчапы Вольного формата');

export default async function Page() {
  const initial = await loadPublicStandardMatchups('wild');
  // Regenerating at runtime without data throws: Next does not publish the result and keeps the earlier copy.
  // Only the build, which has no Express, prints the stub; the warm-up after a deploy replaces it.
  if (!initial && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open Wild matchups unavailable: the earlier copy stays');
  }
  return <>
    <SeoStructuredData path="/standard/matchups/wild" data={initial} />
    <PageBannerPreload />
    <StandardMatchupsPageClient initial={initial} format="wild" />
  </>;
}
