import '@/src/route-parchment.css';
import type { Metadata } from 'next';
import { loadPublicRadar } from '@/apps/public-web/lib/publicRadar';
import { searchParamsQuery, type PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoRegistryMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { RadarPageClient } from '@/apps/public-web/ui/RadarPageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';

export const dynamic = 'force-dynamic';

/**
 * Демо-данные и страница без радара (hs-data-api ещё не отдаёт его) не
 * индексируются: в выдачу не должны попасть выдуманные цитаты или пустая
 * страница с ошибкой. Медленный ответ на это не влияет — только явная ошибка.
 */
export async function generateMetadata({ searchParams }: { searchParams: PageSearchParams }): Promise<Metadata> {
  const [metadata, radar] = await Promise.all([
    seoRegistryMetadata('/standard/radar', 'HearthPulse — радар нерфов и баффов Hearthstone', searchParamsQuery(await searchParams)),
    loadPublicRadar(),
  ]);
  return radar.report?.demo || radar.unavailable ? { ...metadata, robots: 'noindex, follow' } : metadata;
}

export default async function Page() {
  const { report } = await loadPublicRadar();
  return <>
    <SeoStructuredData path="/standard/radar" />
    <RadarPageClient initial={report} />
  </>;
}
