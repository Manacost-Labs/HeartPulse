import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicTierlist } from '@/apps/public-web/lib/publicTierlist';
import { SeoPageIntro } from '@/apps/public-web/ui/SeoPageIntro';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { TierListPublicPool } from '@/apps/public-web/ui/TierListPublicPool';

// Prerendered and cheap to prefetch: the paid view loads in the browser for
// subscribers only, while the open layer (the whole pool with tier, winrate
// and pick rate, date) is read here from Express's anonymous projection. nginx sends query robots as
// X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/tierlist', 'HearthPulse — тир-лист Арены');

export default async function Page() {
  const pool = await loadPublicTierlist();
  return <>
    <SeoStructuredData path="/tierlist" data={pool} />
    <TierListPageClient>
      <TierListPublicPool data={pool} />
      <SeoPageIntro path="/tierlist" />
    </TierListPageClient>
  </>;
}
