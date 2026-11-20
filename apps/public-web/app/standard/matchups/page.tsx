import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMatchupsPageClient } from '@/apps/public-web/ui/StandardMatchupsPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { loadPublicStandardMatchups } from '@/apps/public-web/lib/publicStandardMatchups';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { standardMatchupsSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open general slice of the matrix (all ranks, the most played
// archetypes) is read here from Express's anonymous projection, so a guest and a robot get the same HTML.
// The ranks, periods and history load in the browser for a subscriber only. nginx sends query robots
// as X-Robots-Tag. Regeneration picks up runtime switches and a recovered Express; without Express it renders the
// last good slice (`pageLastGood`) and never throws, which a visitor waiting for the regeneration would get as a 500.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/matchups', 'HearthPulse — матчапы Стандарта',
  async () => standardMatchupsSeoValues(await loadPublicStandardMatchups(), Date.now()));

export default async function Page() {
  const initial = await loadPublicStandardMatchups();
  return <>
    <SeoStructuredData path="/standard/matchups" data={initial} />
    <PageBannerPreload />
    <StandardMatchupsPageClient initial={initial} />
  </>;
}
