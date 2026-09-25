import type { Metadata } from 'next';
import { resolvePublicUrlPolicy } from '../../../src/shared/seo/publicUrlPolicy';
import { cosmeticsListing } from '../../../src/modules/cosmetics/public';
export { cosmeticsListing } from '../../../src/modules/cosmetics/public';

export type CosmeticsSearch = Promise<Record<string, string | string[] | undefined>>;

export async function cosmeticsSearchString(searchParams: CosmeticsSearch) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) value.forEach(entry => params.append(key, entry));
    else if (value !== undefined) params.set(key, value);
  }
  return params.toString();
}

export async function cosmeticsListingMetadata(path: string, searchParams: CosmeticsSearch): Promise<Metadata> {
  const listing = cosmeticsListing(path);
  if (!listing) throw new Error(`Unknown cosmetics listing: ${path}`);
  const policy = await resolvePublicUrlPolicy(path, await cosmeticsSearchString(searchParams));
  const canonical = policy.canonicalUrl ?? `https://hearthpulse.net${listing.pathname}`;
  const title = `${listing.heading} Hearthstone | HearthPulse`;
  return {
    title, description: listing.description,
    alternates: { canonical },
    robots: { index: policy.indexPolicy === 'index', follow: policy.indexPolicy !== 'noindex-nofollow' },
    openGraph: { type: 'website', url: canonical, siteName: 'HearthPulse', locale: 'ru_RU',
      title, description: listing.description,
      images: [{ url: '/assets/og-preview.png', alt: listing.heading, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title, description: listing.description, images: ['/assets/og-preview.png'] },
  };
}
