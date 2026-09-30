import type { Metadata } from 'next';
import { cosmeticsListing } from '@/src/modules/cosmetics/public';
import { searchParamsQuery } from './searchParams';
import { seoRegistryMetadata } from './seoPageMetadata';
export { cosmeticsListing } from '@/src/modules/cosmetics/public';

export type CosmeticsSearch = Promise<Record<string, string | string[] | undefined>>;

export async function cosmeticsSearchString(searchParams: CosmeticsSearch) {
  return searchParamsQuery(await searchParams);
}

export async function cosmeticsListingMetadata(path: string, searchParams: CosmeticsSearch): Promise<Metadata> {
  const listing = cosmeticsListing(path);
  if (!listing) throw new Error(`Unknown cosmetics listing: ${path}`);
  return seoRegistryMetadata(path, `HearthPulse — ${listing.heading}`, await cosmeticsSearchString(searchParams));
}
