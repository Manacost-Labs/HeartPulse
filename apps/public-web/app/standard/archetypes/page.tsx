import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { ConstructedArchetypesPageClient } from '@/apps/public-web/ui/ConstructedArchetypesPageClient';
import { type PageSearchParams, searchParamsQuery, seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/archetypes', 'HearthPulse — архетипы Hearthstone');

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  return <ConstructedArchetypesPageClient initialSearch={searchParamsQuery(await searchParams)} />;
}
