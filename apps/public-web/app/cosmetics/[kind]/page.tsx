import { notFound } from 'next/navigation';
import '../../../../../src/route-parchment.css';
import '../../../../../src/features/Cosmetics.css';
import { cosmeticsListing, cosmeticsListingMetadata, cosmeticsSearchString,
  type CosmeticsSearch } from '../../../lib/cosmeticsListing';
import { CosmeticsPageClient } from '../../../ui/CosmeticsPageClient';

type Props = { params: Promise<{ kind: string }>; searchParams: CosmeticsSearch };
export const dynamic = 'force-dynamic';

async function listingFor(params: Props['params']) {
  const { kind } = await params;
  const listing = cosmeticsListing(`/cosmetics/${kind}`);
  if (!listing) notFound();
  return listing;
}

export async function generateMetadata({ params, searchParams }: Props) {
  const listing = await listingFor(params);
  return cosmeticsListingMetadata(listing.pathname, searchParams);
}

export default async function Page({ params, searchParams }: Props) {
  const listing = await listingFor(params);
  return <CosmeticsPageClient pathname={listing.pathname} search={await cosmeticsSearchString(searchParams)} />;
}
