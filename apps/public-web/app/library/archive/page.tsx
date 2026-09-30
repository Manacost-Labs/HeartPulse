import '@/src/route-parchment.css';
import { battlegroundLibraryListing, battlegroundLibraryMetadata, type LibrarySearch } from '@/apps/public-web/lib/battlegroundLibraryListing';
import { BattlegroundLibraryPageClient } from '@/apps/public-web/ui/BattlegroundLibraryPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: LibrarySearch }) {
  return battlegroundLibraryMetadata('/library/archive', searchParams);
}

export default function Page() {
  const listing = battlegroundLibraryListing('/library/archive');
  if (!listing) throw new Error('Missing Battleground library archive SEO contract');
  return <>
    <SeoStructuredData path="/library/archive" />
    <BattlegroundLibraryPageClient {...listing} />
  </>;
}
