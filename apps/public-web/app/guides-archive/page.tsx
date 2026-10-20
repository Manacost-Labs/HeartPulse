import '@/src/route-parchment.css';
import '@/src/shared/ui/LoadingSurface.css';
import { GuidesArchivePageClient } from '@/apps/public-web/ui/GuidesArchivePageClient';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and cheap to prefetch: the data loads in the browser, and nginx
// sends query robots as X-Robots-Tag. Regeneration picks up runtime switches.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/guides-archive', 'HearthPulse — архив гайдов');

export default function Page() {
  return <>
    <SeoStructuredData path="/guides-archive" />
    <GuidesArchivePageClient />
  </>;
}
