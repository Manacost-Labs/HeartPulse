import '@/src/route-parchment.css';
import '@/src/features/Cosmetics.css';
import { cosmeticsSearchString, type CosmeticsSearch } from '@/apps/public-web/lib/cosmeticsListing';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { CosmeticsPageClient } from '@/apps/public-web/ui/CosmeticsPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export const generateMetadata = seoPageMetadata('/cosmetics', 'HearthPulse — косметика Hearthstone');

export default async function Page({ searchParams }: { searchParams: CosmeticsSearch }) {
  return <>
    <SeoStructuredData path="/cosmetics" />
    <CosmeticsPageClient pathname="/cosmetics/" search={await cosmeticsSearchString(searchParams)} />
  </>;
}
