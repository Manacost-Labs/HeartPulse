import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import '@/src/features/TraditionalModeBanner.css';
import { ViciousGoldPageClient } from '@/apps/public-web/ui/ViciousGoldPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

// Prerendered and cheap to prefetch: the data loads in the browser, and nginx
// sends query robots as X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/vicious-gold', 'HearthPulse — Vicious Syndicate Gold');

export default function Page() {
  return <>
    <SeoStructuredData path="/standard/vicious-gold" />
    <PageBannerPreload />
    <ViciousGoldPageClient />
  </>;
}
