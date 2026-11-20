import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { arenaTierlistSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { loadPublicTierlist } from '@/apps/public-web/lib/publicTierlist';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { compactTierlist } from '@/apps/public-web/lib/openTierlistView';

// Prerendered and cheap to prefetch: the open tier list (the whole pool with tier,
// winrate and pick rate, date) is read here from Express's anonymous projection and
// rendered in the subscriber's view for everyone; the protected figures load in the
// browser for subscribers only. nginx sends query robots as X-Robots-Tag.
// Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/tierlist', 'HearthPulse — тир-лист Арены',
  async () => arenaTierlistSeoValues(await loadPublicTierlist(), Date.now()));

export default async function Page() {
  const pool = await loadPublicTierlist();
  return <>
    <SeoStructuredData path="/tierlist" data={pool} />
    <TierListPageClient pool={pool ? compactTierlist(pool) : null} />
  </>;
}
