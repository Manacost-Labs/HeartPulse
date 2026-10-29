import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMetaPageClient } from '@/apps/public-web/ui/StandardMetaPageClient';
import { loadPublicStandardMetaTeaser } from '@/apps/public-web/lib/publicStandardMetaTeaser';
import { standardMetaSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { StandardMetaDataNote } from '@/apps/public-web/ui/StandardMetaDataNote';

// Prerendered and regenerated every 5 minutes (PRERENDERED_DATA_REVALIDATE_SECONDS),
// so a link prefetch brings the whole page and opening it needs no server
// round trip. Nginx sends query robots as X-Robots-Tag.
export const revalidate = 300;
// The title and description carry the date and the leader of the teaser the page
// shows; the loader is cached per render, so metadata adds no second Express read.
export const generateMetadata = seoStaticPageMetadata('/standard/meta', 'HearthPulse — мета Стандарта',
  async () => standardMetaSeoValues(await loadPublicStandardMetaTeaser(), Date.now()));

export default async function Page() {
  const teaser = await loadPublicStandardMetaTeaser();
  return <>
    <SeoStructuredData path="/standard/meta" />
    <StandardMetaPageClient initialTeaser={teaser}>
      <StandardMetaDataNote teaser={teaser} />
    </StandardMetaPageClient>
  </>;
}
