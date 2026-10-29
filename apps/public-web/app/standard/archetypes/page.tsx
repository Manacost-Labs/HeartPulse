import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ConstructedArchetypesPageClient } from '@/apps/public-web/ui/ConstructedArchetypesPageClient';
import { loadPublicArchetypeCatalogTeaser } from '@/apps/public-web/lib/publicArchetypeCatalogTeaser';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { type PageSearchParams, searchParamsQuery } from '@/apps/public-web/lib/searchParams';
import { archetypeCatalogSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
// The title and description carry the date and the size of the catalog teaser the page shows.
export const generateMetadata = seoPageMetadata('/standard/archetypes', 'HearthPulse — архетипы Hearthstone',
  async search => archetypeCatalogSeoValues(await loadPublicArchetypeCatalogTeaser(search), Date.now()));

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const initialSearch = searchParamsQuery(await searchParams);
  // The loader is cached per render: the title, the page and the JSON-LD date read one answer.
  const catalog = await loadPublicArchetypeCatalogTeaser(initialSearch);
  return <>
    <SeoStructuredData path="/standard/archetypes" data={catalog} />
    <PageBannerPreload />
    <ConstructedArchetypesPageClient initialSearch={initialSearch} initialCatalog={catalog} />
  </>;
}
