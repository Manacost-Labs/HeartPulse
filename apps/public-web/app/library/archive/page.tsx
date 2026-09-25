import '../../../../../src/route-parchment.css';
import { battlegroundLibraryListing, battlegroundLibraryMetadata, type LibrarySearch } from '../../../lib/battlegroundLibraryListing';
import { BattlegroundLibraryPageClient } from '../../../ui/BattlegroundLibraryPageClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: LibrarySearch }) {
  return battlegroundLibraryMetadata('/library/archive', searchParams);
}

export default function Page() {
  const listing = battlegroundLibraryListing('/library/archive');
  if (!listing) throw new Error('Missing Battleground library archive SEO contract');
  return <BattlegroundLibraryPageClient {...listing} />;
}
