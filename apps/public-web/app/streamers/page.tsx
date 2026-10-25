import '@/src/route-parchment.css';
import type { Metadata } from 'next';
import { loadPublicStreamers } from '@/apps/public-web/lib/publicStreamers';
import { searchParamsQuery, type PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoRegistryMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { StreamersPageClient } from '@/apps/public-web/ui/StreamersPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

/** Без данных (hs-data-api ещё не отдаёт стримеров) страница с ошибкой не индексируется. */
export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const [metadata, streamers] = await Promise.all([
    seoRegistryMetadata('/streamers', 'HearthPulse — стримеры Hearthstone и их колоды', searchParamsQuery(await searchParams)),
    loadPublicStreamers(),
  ]);
  return streamers.unavailable ? { ...metadata, robots: 'noindex, follow' } : metadata;
}

export default async function Page() {
  const { page } = await loadPublicStreamers();
  return <>
    <SeoStructuredData path="/streamers" />
    <StreamersPageClient initial={page} />
  </>;
}
