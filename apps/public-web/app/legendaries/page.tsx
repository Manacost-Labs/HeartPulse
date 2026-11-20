import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { LegendariesPageClient } from '@/apps/public-web/ui/LegendariesPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { arenaLegendariesSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { loadPublicLegendaries } from '@/apps/public-web/lib/publicLegendaries';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the open layer of the groups (the key card,
// companions, class, winrate, pick rate, sample, source, date) is read here from
// Express's anonymous projection, so a guest and a robot get the same HTML. The
// paid figures (offer rate, ArenaSmith score) load in the browser for a
// subscriber only. nginx sends query robots as X-Robots-Tag. Regeneration
// picks up runtime switches and a recovered Express.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/legendaries', 'HearthPulse — легендарки Арены',
  async () => arenaLegendariesSeoValues(await loadPublicLegendaries(), Date.now()));

export default async function Page() {
  const initial = await loadPublicLegendaries();
  return <>
    <SeoStructuredData path="/legendaries" data={initial} />
    <LegendariesPageClient initial={initial} />
  </>;
}
