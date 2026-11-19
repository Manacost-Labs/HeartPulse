import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMatchupsPageClient } from '@/apps/public-web/ui/StandardMatchupsPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { loadPublicStandardMatchups } from '@/apps/public-web/lib/publicStandardMatchups';
import type { PublicStandardMatchups } from '@/src/modules/standardMatchups/public';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open general slice of the matrix (all ranks, the most played
// archetypes) is read here from Express's anonymous projection, so a guest and a robot get the same HTML.
// The ranks, periods and history load in the browser for a subscriber only. nginx sends query robots
// as X-Robots-Tag. Regeneration picks up runtime switches and a recovered Express.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/matchups', 'HearthPulse — матчапы Стандарта');

// The last good slice this server printed. A regeneration that finds Express down prints it again (with its own
// date) instead of an empty page; only a server that never had the data says «temporarily unavailable».
let lastGood: PublicStandardMatchups | null = null;

export default async function Page() {
  const initial = (await loadPublicStandardMatchups()) ?? lastGood;
  if (initial) lastGood = initial;
  return <>
    <SeoStructuredData path="/standard/matchups" data={initial} />
    <PageBannerPreload />
    <StandardMatchupsPageClient initial={initial} />
  </>;
}
