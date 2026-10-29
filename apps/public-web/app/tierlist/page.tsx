import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { TierListPageClient } from '@/apps/public-web/ui/TierListPageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoPageIntro } from '@/apps/public-web/ui/SeoPageIntro';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the data loads in the browser, and nginx
// sends query robots as X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/tierlist', 'HearthPulse — тир-лист Арены');

export default function Page() {
  return <>
    <SeoStructuredData path="/tierlist" />
    <TierListPageClient>
      <SeoPageIntro path="/tierlist" />
    </TierListPageClient>
  </>;
}
