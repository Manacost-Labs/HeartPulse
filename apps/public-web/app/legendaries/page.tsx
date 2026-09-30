import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { LegendariesPageClient } from '@/apps/public-web/ui/LegendariesPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/legendaries', 'HearthPulse — легендарки Арены');

export default function Page() {
  return <>
    <SeoStructuredData path="/legendaries" />
    <LegendariesPageClient />
  </>;
}
