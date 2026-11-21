import '@/src/route-parchment.css';
import '@/src/features/TraditionalModeBanner.css';
import { FunDecksPageClient } from '@/apps/public-web/ui/FunDecksPageClient';
import { loadPublicFunDecksPreview } from '@/apps/public-web/lib/publicFunDecksPreview';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';
import { SeoStructuredData } from '@/apps/public-web/ui/SeoStructuredData';
import { DECK_LAYOUT_RESTORE_SCRIPT } from '@/src/features/deckViews/deckLayoutStorage';
import { readFunDecksQuery } from '@/src/features/funDecksQuery';

export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/fun-decks', 'HearthPulse — фан-колоды');

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The page's own parameters of the address (`?format=wild&class=…&tag=…&sort=…`), as the browser reads them. */
async function addressFilters(searchParams: Search) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') params.set(name, first);
  }
  const { query: _query, ...filters } = readFunDecksQuery(params.toString());
  return filters;
}

/**
 * The page is rendered per request, so a link's filters and sort are drawn on
 * the server: the first paint already is the filtered list. The reader's kept
 * deck view lives in the browser only; the inline script marks it before the
 * list is parsed (`DECK_LAYOUT_RESTORE_SCRIPT`).
 */
export default async function Page({ searchParams }: { searchParams: Search }) {
  const [preview, filters] = await Promise.all([loadPublicFunDecksPreview(), addressFilters(searchParams)]);
  return <>
    <SeoStructuredData path="/standard/fun-decks" />
    <script dangerouslySetInnerHTML={{ __html: DECK_LAYOUT_RESTORE_SCRIPT }} />
    <FunDecksPageClient initialPreview={preview} initialFilters={filters} />
  </>;
}
