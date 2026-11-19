import 'server-only';
import { cache } from 'react';
import { fetchPublicExpress } from './expressApi';
import { readFirstPaintJson } from './publicFirstPaintRead';
import { PRERENDERED_DATA_READ_BUDGET_MS, PRERENDERED_DATA_REVALIDATE_SECONDS } from './prerenderedData';
import {
  LIBRARY_INDEX_PATH, libraryListingPath, parsePublicLibraryIndex, parsePublicLibraryListing,
  type LibraryListingKind, type PublicLibraryListing,
} from './publicBattlegroundLibraryListingData';

const read = (path: string) => readFirstPaintJson(
  signal => fetchPublicExpress(path, signal, { revalidate: PRERENDERED_DATA_REVALIDATE_SECONDS }),
  Date.now() + PRERENDERED_DATA_READ_BUDGET_MS,
);

// The last listing this process verified, per kind: a regeneration whose source fails is served from it, so a
// failing source never replaces a listing with an empty one. It hangs off `globalThis` like the other last good stores.
const LAST_GOOD = Symbol.for('hearthpulse.libraryListingLastGood');
const lastGood = (): Map<LibraryListingKind, PublicLibraryListing> => {
  const holder = globalThis as unknown as Record<symbol, Map<LibraryListingKind, PublicLibraryListing>>;
  return holder[LAST_GOOD] ??= new Map();
};

/**
 * The open listing of one kind for the prerendered guest view. A failing source is answered from the last verified
 * listing of this process, so a regeneration never replaces a listing with an empty one. A listing this process never
 * read is `null`: the page is then served with a notice instead of its cards (as the open hero ranking is), and the
 * next regeneration retries.
 */
export const loadPublicLibraryListing = cache(async (kind: LibraryListingKind): Promise<PublicLibraryListing | null> => {
  const listing = parsePublicLibraryListing(await read(libraryListingPath(kind)), kind);
  if (listing) lastGood().set(kind, listing);
  return listing ?? lastGood().get(kind) ?? null;
});

/** The sizes of the listings. Never throws: the hub page keeps its links without the numbers. */
export const loadPublicLibraryIndex = cache(async () => parsePublicLibraryIndex(await read(LIBRARY_INDEX_PATH)));
