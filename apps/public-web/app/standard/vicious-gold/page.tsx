import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import '@/src/features/TraditionalModeBanner.css';
import { ViciousGoldPageClient } from '@/apps/public-web/ui/ViciousGoldPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { loadPublicViciousGold } from '@/apps/public-web/lib/publicViciousGold';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

// Prerendered and regenerated every 5 minutes with the open frame of the report (#656), read without a cookie:
// a guest and a robot get the same HTML, and it has no paid value. Nginx sends query robots as X-Robots-Tag.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/vicious-gold', 'HearthPulse — Vicious Syndicate Gold');

export default async function Page() {
  const open = await loadPublicViciousGold();
  return <>
    <SeoStructuredData path="/standard/vicious-gold" />
    <PageBannerPreload />
    <ViciousGoldPageClient initialOpen={open} />
  </>;
}
