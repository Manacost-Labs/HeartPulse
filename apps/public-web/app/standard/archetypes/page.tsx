import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import type { Metadata } from 'next';
import { ConstructedArchetypesPageClient } from '@/apps/public-web/ui/ConstructedArchetypesPageClient';
import { loadPublicArchetypeCatalogTeaser } from '@/apps/public-web/lib/publicArchetypeCatalogTeaser';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { type PageSearchParams, searchParamsQuery } from '@/apps/public-web/lib/searchParams';
import { archetypeCatalogSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { readInitialCatalogFilters } from '@/src/features/constructedArchetypeCatalogUrl';
import { robotsContent } from '@/src/shared/seo/robots';

export const dynamic = 'force-dynamic';
// The title and description carry the date and the size of the catalog teaser the page shows.
const registryMetadata = seoPageMetadata('/standard/archetypes', 'HearthPulse — архетипы Hearthstone',
  async search => archetypeCatalogSeoValues(await loadPublicArchetypeCatalogTeaser(search), Date.now()));

/** The old address of the Wild catalog, `?format=wild`, still opens it; the Wild list has its own page (#543). */
const isWild = (search: string) => readInitialCatalogFilters(search, []).format === 'wild';
const WILD_LIST_URL = 'https://hearthpulse.net/standard/archetypes/wild/';

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const metadata = await registryMetadata({ searchParams });
  if (!isWild(searchParamsQuery(await searchParams))) return metadata;
  // Wild's catalog is never the canonical Standard list: out of the index, pointing at the Wild list.
  return { ...metadata, robots: robotsContent('noindex-follow'), alternates: { canonical: WILD_LIST_URL },
    openGraph: { ...metadata.openGraph, url: WILD_LIST_URL } };
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const initialSearch = searchParamsQuery(await searchParams);
  // The loader is cached per render: the title, the page and the JSON-LD date read one answer.
  const catalog = await loadPublicArchetypeCatalogTeaser(initialSearch);
  return <>
    {isWild(initialSearch) ? null : <SeoStructuredData path="/standard/archetypes" data={catalog} />}
    <PageBannerPreload />
    <ConstructedArchetypesPageClient initialSearch={initialSearch} initialCatalog={catalog} />
  </>;
}
