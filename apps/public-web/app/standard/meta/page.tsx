import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMetaPageClient } from '@/apps/public-web/ui/StandardMetaPageClient';
import { loadPublicStandardMetaTeaser } from '@/apps/public-web/lib/publicStandardMetaTeaser';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/meta', 'HearthPulse — мета Стандарта');

export default async function Page() {
  return <>
    <SeoStructuredData path="/standard/meta" />
    <StandardMetaPageClient initialTeaser={await loadPublicStandardMetaTeaser()} />
  </>;
}
