import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMatchupsPageClient } from '@/apps/public-web/ui/StandardMatchupsPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/matchups', 'HearthPulse — матчапы Стандарта');

export default function Page() {
  return <>
    <SeoStructuredData path="/standard/matchups" />
    <PageBannerPreload />
    <StandardMatchupsPageClient />
  </>;
}
