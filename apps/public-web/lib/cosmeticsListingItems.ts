import type { CosmeticsCatalogSeed } from '@/src/features/Cosmetics';
import type { CosmeticKind } from '@/src/modules/cosmetics/public';

const ORIGIN = 'https://hearthpulse.net';

type Names = { ru: string; en: string | null };
type Entry = { cardId: string; name: string | Names };

/**
 * The entries of a cosmetics listing exactly as its grid prints them: the link of every card and
 * the name on it (a hero's Russian name, a coin's English one, a pet's own). Only an unfiltered
 * first page is the canonical listing, so any request with a query yields none; so does a grid
 * the server did not render (`seed` is `null`: the browser loads it).
 */
export function cosmeticsListingItems(kind: CosmeticKind, search: string, seed: CosmeticsCatalogSeed | null) {
  if (search || !seed) return undefined;
  const entries = (kind === 'pets'
    ? (seed.payload.items as Array<{ variants: Entry[] }>).flatMap(family => family.variants)
    : seed.payload.items as unknown as Entry[]);
  return entries.map(entry => ({
    name: typeof entry.name === 'string' ? entry.name : kind === 'coins' ? entry.name.en || entry.name.ru : entry.name.ru,
    url: `${ORIGIN}/cosmetics/${kind}/${encodeURIComponent(entry.cardId)}/`,
  }));
}
