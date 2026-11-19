import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMatchupsPageClient } from '@/apps/public-web/ui/StandardMatchupsPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { loadPublicStandardMatchups } from '@/apps/public-web/lib/publicStandardMatchups';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open general slice of the matrix (all ranks, the most played
// archetypes) is read here from Express's anonymous projection, so a guest and a robot get the same HTML.
// The ranks, periods and history load in the browser for a subscriber only. nginx sends query robots
// as X-Robots-Tag. Regeneration picks up runtime switches and a recovered Express.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/matchups', 'HearthPulse — матчапы Стандарта');

export default async function Page() {
  const initial = await loadPublicStandardMatchups();
  // A failed regeneration keeps the last good copy; only the build (no API yet) may print the empty state.
  if (!initial && process.env.NEXT_PHASE !== 'phase-production-build') {
    throw new Error('Open Standard matchups unavailable: the last generated page stays');
  }
  return <>
    <SeoStructuredData path="/standard/matchups" data={initial} />
    <PageBannerPreload />
    <StandardMatchupsPageClient initial={initial} />
  </>;
}
