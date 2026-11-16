import '@/src/route-parchment.css';
import '@/src/features/Cosmetics.css';
import { cosmeticsSearchString, type CosmeticsSearch } from '@/apps/public-web/lib/cosmeticsListing';
import { cosmeticsListingItems } from '@/apps/public-web/lib/cosmeticsListingItems';
import { loadPublicCosmeticsCatalog } from '@/apps/public-web/lib/publicCosmeticsCatalog';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { CosmeticsPageClient } from '@/apps/public-web/ui/CosmeticsPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export const generateMetadata = seoPageMetadata('/cosmetics', 'HearthPulse — косметика Hearthstone');

export default async function Page({ searchParams }: { searchParams: CosmeticsSearch }) {
  const search = await cosmeticsSearchString(searchParams);
  const catalog = await loadPublicCosmeticsCatalog('heroes', search);
  return <>
    <SeoStructuredData path="/cosmetics" items={cosmeticsListingItems('heroes', search, catalog)} />
    <CosmeticsPageClient pathname="/cosmetics/" search={search} initialCatalog={catalog} />
  </>;
}
