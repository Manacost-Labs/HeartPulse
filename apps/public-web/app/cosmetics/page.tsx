import '@/src/route-parchment.css';
import '@/src/features/Cosmetics.css';
import { cosmeticsListingMetadata, cosmeticsSearchString, type CosmeticsSearch } from '@/apps/public-web/lib/cosmeticsListing';
import { CosmeticsPageClient } from '@/apps/public-web/ui/CosmeticsPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: CosmeticsSearch }) {
  return cosmeticsListingMetadata('/cosmetics', searchParams);
}

export default async function Page({ searchParams }: { searchParams: CosmeticsSearch }) {
  return <CosmeticsPageClient pathname="/cosmetics/" search={await cosmeticsSearchString(searchParams)} />;
}
