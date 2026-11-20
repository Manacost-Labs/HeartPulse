import { DecksHubPage } from '@/apps/public-web/ui/DecksHubPage';
import { hubArchetypes } from '@/apps/public-web/lib/classDecks';
import { loadBestBuilds, loadDecksCatalog } from '@/apps/public-web/lib/publicClassDecks';
import { archetypeCatalogSeoValues } from '@/apps/public-web/lib/seoDataValues';
import { seoPageMetadata } from '@/apps/public-web/lib/seoPageMetadata';

// The deck hub of Standard (#309): server HTML only. `proxy.ts` answers 503 without the catalog.
export const dynamic = 'force-dynamic';
export const generateMetadata = seoPageMetadata('/standard/decks', 'HearthPulse — лучшие колоды Hearthstone',
  async () => archetypeCatalogSeoValues(await loadDecksCatalog(), Date.now()));

export default async function Page() {
  const catalog = await loadDecksCatalog();
  if (!catalog) throw new Error('Deck catalog temporarily unavailable');
  const builds = await loadBestBuilds(hubArchetypes(catalog).flatMap(({ best }) => (best ? [best.slug] : [])));
  return <DecksHubPage catalog={catalog} builds={builds} />;
}
