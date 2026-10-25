import '@/src/route-parchment.css';
import type { Metadata } from 'next';
import { parseLeaderboardSelection } from '@/src/modules/leaderboards/public';
import { loadPublicLeaderboards } from '@/apps/public-web/lib/publicLeaderboards';
import { searchParamsQuery, type PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoRegistryMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { LeaderboardsPageClient } from '@/apps/public-web/ui/LeaderboardsPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  return seoRegistryMetadata('/leaderboards', 'HearthPulse — таблицы лидеров Hearthstone', searchParamsQuery(await searchParams));
}

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const selection = parseLeaderboardSelection(new URLSearchParams(searchParamsQuery(await searchParams)));
  return <>
    <SeoStructuredData path="/leaderboards" />
    <LeaderboardsPageClient initial={await loadPublicLeaderboards(selection)} />
  </>;
}
