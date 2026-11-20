import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ConstructedArchetypesPageClient } from '@/apps/public-web/ui/ConstructedArchetypesPageClient';
import { loadPublicArchetypeCatalogTeaser } from '@/apps/public-web/lib/publicArchetypeCatalogTeaser';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { type PageSearchParams, searchParamsQuery } from '@/apps/public-web/lib/searchParams';
import { archetypeCatalogSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

/** The page's catalog is Wild's whatever the query says; the loader reads only the format of its argument. */
const WILD = '?format=wild';

// The server list of Wild archetypes (#543): the same guest view as /standard/archetypes/, at its own address.
export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/archetypes/wild', 'HearthPulse — архетипы Вольного формата Hearthstone',
  async () => archetypeCatalogSeoValues(await loadPublicArchetypeCatalogTeaser(WILD), Date.now()));

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const initialSearch = searchParamsQuery(await searchParams);
  // The loader is cached per render: the title, the page and the JSON-LD date read one answer.
  const catalog = await loadPublicArchetypeCatalogTeaser(WILD);
  return <>
    <SeoStructuredData path="/standard/archetypes/wild" data={catalog} />
    <PageBannerPreload />
    <ConstructedArchetypesPageClient initialSearch={initialSearch} initialCatalog={catalog} format="wild" />
  </>;
}
