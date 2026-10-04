import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ConstructedArchetypesPageClient } from '@/apps/public-web/ui/ConstructedArchetypesPageClient';
import { PageBannerPreload } from '@/apps/public-web/ui/PageBannerPreload';
import { type PageSearchParams, searchParamsQuery } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/archetypes', 'HearthPulse — архетипы Hearthstone');

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  return <>
    <PageBannerPreload />
    <ConstructedArchetypesPageClient initialSearch={searchParamsQuery(await searchParams)} />
  </>;
}
