import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import { GuidesArchivePageClient } from '@/apps/public-web/ui/GuidesArchivePageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/guides-archive', 'HearthPulse — архив гайдов');

export default function Page() {
  return <>
    <SeoStructuredData path="/guides-archive" />
    <GuidesArchivePageClient />
  </>;
}
