import { notFound } from 'next/navigation';
import '../../../../../src/route-parchment.css';
import { battlegroundLibraryListing, battlegroundLibraryMetadata, type LibrarySearch } from '../../../lib/battlegroundLibraryListing';
import { BattlegroundLibraryPageClient } from '../../../ui/BattlegroundLibraryPageClient';

type Props = { params: Promise<{ kind: string }>; searchParams: LibrarySearch };
export const dynamic = 'force-dynamic';

async function listingFor(params: Props['params']) {
  const { kind } = await params;
  if (kind !== 'minions' && kind !== 'spells') notFound();
  const listing = battlegroundLibraryListing(`/library/${kind}`);
  if (!listing) notFound();
  return listing;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const listing = await listingFor(params);
  return battlegroundLibraryMetadata(listing.pathname, searchParams);
}

export default async function Page({ params }: Props) {
  return <BattlegroundLibraryPageClient {...await listingFor(params)} />;
}
