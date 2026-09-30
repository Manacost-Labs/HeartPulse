import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import '@/src/features/contests.css';
import { loadPublicContests } from '@/apps/public-web/lib/publicContests';
import { ContestsPageClient } from '@/apps/public-web/ui/ContestsPageClient';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/contests', 'HearthPulse — конкурсы');

export default async function Page() {
  return <>
    <SeoStructuredData path="/contests" />
    <ContestsPageClient initialContests={await loadPublicContests()} />
  </>;
}
