import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { loadPublicTierlistTeaser } from '@/apps/public-web/lib/publicTierlistTeaser';
import { SeoPageIntro } from '@/apps/public-web/ui/SeoPageIntro';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { TierListPublicTeaser } from '@/apps/public-web/ui/TierListPublicTeaser';

// Prerendered and cheap to prefetch: the full list loads in the browser for
// subscribers only, while the open slice (top cards, tiers, date) is read here
// from Express's anonymous projection. nginx sends query robots as
// X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/tierlist', 'HearthPulse — тир-лист Арены');

export default async function Page() {
  const teaser = await loadPublicTierlistTeaser();
  return <>
    <SeoStructuredData path="/tierlist" data={teaser} />
    <TierListPageClient>
      <TierListPublicTeaser data={teaser} />
      <SeoPageIntro path="/tierlist" />
    </TierListPageClient>
  </>;
}
