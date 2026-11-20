import { classDecksMetadata, loadBestBuilds, loadDecksCatalog, resolveDeckClass } from '@/apps/public-web/lib/publicClassDecks';
import { classArchetypes } from '@/apps/public-web/lib/classDecks';
import { ClassDecksPage } from '@/apps/public-web/ui/ClassDecksPage';

type Props = { params: Promise<{ classKey: string }> };

// A class page of Standard decks (#309): server HTML only; an unknown class is a 404, no catalog a 503 (`proxy.ts`).
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props) {
  return classDecksMetadata(await resolveDeckClass(params));
}

export default async function Page({ params }: Props) {
  const [entry, catalog] = await Promise.all([resolveDeckClass(params), loadDecksCatalog()]);
  if (!catalog) throw new Error('Deck catalog temporarily unavailable');
  const builds = await loadBestBuilds(classArchetypes(catalog, entry.key).map(row => row.slug));
  return <ClassDecksPage entry={entry} catalog={catalog} builds={builds} />;
}
