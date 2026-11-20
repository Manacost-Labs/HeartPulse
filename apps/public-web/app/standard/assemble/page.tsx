import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { loadPublicCardAssemble } from '@/apps/public-web/lib/publicCardAssemble';
import type { PageSearchParams } from '@/apps/public-web/lib/searchParams';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { AssemblePageClient } from '@/apps/public-web/ui/AssemblePageClient';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { assembleCardIdFromSearch, assembleFormatFromSearch } from '@/src/modules/constructedCards/public';

// Dynamic on purpose: `?format=wild` and `?card=` must reach the server render (without reading
// `searchParams` Next would prerender one copy and a no-JS visitor of `?format=wild` would get Standard).
// The canonical of every query is `/standard/assemble/` (the URL policy keeps it).
export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/assemble', 'HearthPulse — Сборка');

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function Page({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const format = assembleFormatFromSearch(first(params.format));
  const card = assembleCardIdFromSearch(first(params.card));
  const seed = await loadPublicCardAssemble(format, card);
  return <>
    <SeoStructuredData path="/standard/assemble" />
    <AssemblePageClient format={format} card={card} initialList={seed.list} initialCard={seed.card} />
  </>;
}
