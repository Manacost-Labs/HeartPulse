import '@/src/route-parchment.css';
import { battlegroundLibraryListing, battlegroundLibraryStaticMetadata } from '@/apps/public-web/lib/battlegroundLibraryListing';
import { loadPublicLibraryIndex } from '@/apps/public-web/lib/publicBattlegroundLibraryListing';
import { BattlegroundLibraryListingJsonLd } from '@/apps/public-web/ui/BattlegroundLibraryListingJsonLd';
import { BattlegroundLibraryPageClient } from '@/apps/public-web/ui/BattlegroundLibraryPageClient';
import { BattlegroundLibraryPublicIndex } from '@/apps/public-web/ui/BattlegroundLibraryPublicIndex';

// Prerendered, regenerated every 5 minutes (PRERENDERED_DATA_REVALIDATE_SECONDS). The sizes of the listings are
// read from Express's anonymous projection; without them the hub keeps its links. nginx sends query robots as
// X-Robots-Tag.
export const revalidate = 300;
export const generateMetadata = () => battlegroundLibraryStaticMetadata('/library');

export default async function Page() {
  const listing = battlegroundLibraryListing('/library');
  if (!listing) throw new Error('Missing Battleground library SEO contract');
  const sizes = await loadPublicLibraryIndex();
  return <>
    <BattlegroundLibraryListingJsonLd path="/library" heading={listing.heading} description={listing.description} listing={null} />
    <BattlegroundLibraryPageClient {...listing}><BattlegroundLibraryPublicIndex sizes={sizes} /></BattlegroundLibraryPageClient>
  </>;
}
