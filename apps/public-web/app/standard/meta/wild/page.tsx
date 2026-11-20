import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { StandardMetaPageClient } from '@/apps/public-web/ui/StandardMetaPageClient';
import { loadPublicStandardMetaPageTeaser } from '@/apps/public-web/lib/publicStandardMetaTeaser';
import { standardMetaSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoStaticPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

// The same prerendered guest view as /standard/meta/, for the Wild format: its own
// address, title, canonical and open slice, so a crawler and a guest read one HTML.
export const revalidate = 300;
export const generateMetadata = seoStaticPageMetadata('/standard/meta/wild', 'HearthPulse — мета Вольного формата',
  async () => standardMetaSeoValues(await loadPublicStandardMetaPageTeaser('wild'), Date.now()));

export default async function Page() {
  const teaser = await loadPublicStandardMetaPageTeaser('wild');
  return <>
    <SeoStructuredData path="/standard/meta/wild" data={teaser?.data} />
    <StandardMetaPageClient initialTeaser={teaser} format="wild" />
  </>;
}
