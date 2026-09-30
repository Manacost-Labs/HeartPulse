import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { DeveloperApiPageClient } from '@/apps/public-web/ui/DeveloperApiPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const generateMetadata = seoStaticPageMetadata('/developers/api', 'HearthPulse — Manacost Public API');

export default function Page() {
  return <>
    <SeoStructuredData path="/developers/api" />
    <DeveloperApiPageClient />
  </>;
}
