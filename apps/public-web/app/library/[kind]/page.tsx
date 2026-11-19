import { notFound } from 'next/navigation';
import '@/src/route-parchment.css';
import { battlegroundLibraryListing, battlegroundLibraryStaticMetadata } from '@/apps/public-web/lib/battlegroundLibraryListing';
import { loadPublicLibraryListing } from '@/apps/public-web/lib/publicBattlegroundLibraryListing';
import { LIBRARY_LISTING_KINDS, type LibraryListingKind } from '@/apps/public-web/lib/publicBattlegroundLibraryListingData';
import { BattlegroundLibraryListingJsonLd } from '@/apps/public-web/ui/BattlegroundLibraryListingJsonLd';
import { BattlegroundLibraryPageClient } from '@/apps/public-web/ui/BattlegroundLibraryPageClient';
import { BattlegroundLibraryPublicListing } from '@/apps/public-web/ui/BattlegroundLibraryPublicListing';

type Props = { params: Promise<{ kind: string }> };
// Prerendered on the first visit and regenerated every 5 minutes (PRERENDERED_DATA_REVALIDATE_SECONDS). A source
// that fails is answered from the last listing this process verified (`loadPublicLibraryListing`), so a regeneration
// never replaces the cards with an empty page. nginx sends query robots as X-Robots-Tag.
export const revalidate = 300;
// No kind is prerendered at build (the build has no Express): each is rendered with data on its first visit and cached.
export const generateStaticParams = () => [];

async function listingFor(params: Props['params']) {
  const { kind } = await params;
  const listing = battlegroundLibraryListing(`/library/${kind}`);
  if (!listing || !(LIBRARY_LISTING_KINDS as readonly string[]).includes(kind)) notFound();
  return { ...listing, kind: kind as LibraryListingKind };
}

export async function generateMetadata({ params }: Props) {
  const listing = await listingFor(params);
  return battlegroundLibraryStaticMetadata(listing.pathname);
}

export default async function Page({ params }: Props) {
  const { kind, ...listing } = await listingFor(params);
  const data = await loadPublicLibraryListing(kind);
  return <>
    <BattlegroundLibraryListingJsonLd path={listing.pathname} heading={listing.heading} description={listing.description} listing={data} />
    <BattlegroundLibraryPageClient {...listing}>
      {data ? <BattlegroundLibraryPublicListing listing={data} groupLabel="Все карты" />
        : <p className="bg-library-public" role="status">Список карт временно недоступен. Попробуйте позже.</p>}
    </BattlegroundLibraryPageClient>
  </>;
}
