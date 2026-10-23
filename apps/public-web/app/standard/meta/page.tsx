import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMetaPageClient } from '@/apps/public-web/ui/StandardMetaPageClient';
import { loadPublicStandardMetaTeaser } from '@/apps/public-web/lib/publicStandardMetaTeaser';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// Prerendered and regenerated every 5 minutes (PRERENDERED_DATA_REVALIDATE_SECONDS),
// so a link prefetch brings the whole page and opening it needs no server
// round trip. Nginx sends query robots as X-Robots-Tag.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/meta', 'HearthPulse — мета Стандарта');

export default async function Page() {
  return <>
    <SeoStructuredData path="/standard/meta" />
    <StandardMetaPageClient initialTeaser={await loadPublicStandardMetaTeaser()} />
  </>;
}
