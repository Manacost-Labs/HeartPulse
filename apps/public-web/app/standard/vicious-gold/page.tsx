import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ViciousGoldPageClient } from '@/apps/public-web/ui/ViciousGoldPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/vicious-gold', 'HearthPulse — Vicious Syndicate Gold');

export default function Page() {
  return <>
    <PageBannerPreload />
    <ViciousGoldPageClient />
  </>;
}
