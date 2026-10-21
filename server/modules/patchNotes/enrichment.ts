import type { PatchNotesArtwork, PatchNotesDetail, PatchNotesEntry } from './contract.js';
import { archetypesForCard, type PatchMetaIndex } from './metaImpact.js';

/** Card facts from the collectible catalog that the page adds to parsed entries. */
export type PatchEntryContext = {
  /** Ids of today's Standard cards; empty means unknown. */
  standard?: ReadonlySet<string>;
  meta?: PatchMetaIndex | null;
  /** Every dbf id of a card: the original print and its reprints share a name and class. */
  dbfs?: (cardId: string) => number[];
  /** Wiki full art of a collectible card; `null` when the catalog has none. */
  artwork?: (cardId: string) => PatchNotesArtwork | null;
};

type CardRow = { name?: unknown; playerClass?: unknown; dbf?: unknown };

/** Reprints (`CORE_`, `VAN_`) are separate dbf ids; a deck may list any of them. */
export function createDbfLookup(cards: Record<string, CardRow>): (cardId: string) => number[] {
  const printKey = (card: CardRow) => `${String(card?.name ?? '').toLocaleLowerCase('ru-RU')}|${String(card?.playerClass ?? '')}`;
  const byPrint = new Map<string, number[]>();
  for (const card of Object.values(cards)) {
    const dbf = Number(card?.dbf);
    if (!Number.isSafeInteger(dbf) || !card?.name) continue;
    byPrint.set(printKey(card), [...(byPrint.get(printKey(card)) ?? []), dbf]);
  }
  return cardId => (cards[cardId] ? byPrint.get(printKey(cards[cardId])) ?? [] : []);
}

const dimension = (value: unknown) => (typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null);

/**
 * Full illustrations of the site's card catalog (`images.art`, the Hearthstone
 * Wiki original kept by kolodahs). A card id also finds the art of its `CORE_`
 * reprint or original, because the patch article names one print and the
 * catalog may illustrate the other.
 */
export function createArtworkLookup(cards: Iterable<Record<string, unknown>>): (cardId: string) => PatchNotesArtwork | null {
  const byId = new Map<string, PatchNotesArtwork>();
  for (const card of cards) {
    const images = card?.images as { art?: unknown; art_metadata?: { width?: unknown; height?: unknown } | null } | undefined;
    const url = typeof images?.art === 'string' ? images.art.trim() : '';
    if (!/^https?:\/\//i.test(url) || typeof card.card_id !== 'string') continue;
    byId.set(card.card_id, { url, width: dimension(images?.art_metadata?.width), height: dimension(images?.art_metadata?.height) });
  }
  return cardId => byId.get(cardId) ?? byId.get(`CORE_${cardId}`) ?? byId.get(cardId.replace(/^CORE_/, '')) ?? null;
}

/** A reprint resolves to its original id while the Standard catalog may list the `CORE_` copy. */
function formatOf(entry: PatchNotesEntry, standard: ReadonlySet<string> | undefined): PatchNotesEntry['format'] {
  if (entry.mode !== 'constructed' || !entry.cardId || !standard?.size) return null;
  const id = entry.cardId;
  return standard.has(id) || standard.has(`CORE_${id}`) || standard.has(id.replace(/^CORE_/, '')) ? 'standard' : 'wild';
}

export function enrichEntry(entry: PatchNotesEntry, context: PatchEntryContext): PatchNotesEntry {
  const format = formatOf(entry, context.standard);
  const archetypes = context.meta && entry.cardId && (entry.mode === 'constructed' || entry.mode === 'other')
    ? archetypesForCard(context.meta, context.dbfs?.(entry.cardId) ?? [])
    : [];
  return { ...entry, format, archetypes, artwork: artworkOf(entry, context.artwork) };
}

function artworkOf(entry: PatchNotesEntry, artwork: PatchEntryContext['artwork']): PatchNotesArtwork | null {
  return entry.mode !== 'battlegrounds' && entry.cardId ? artwork?.(entry.cardId) ?? null : null;
}

/** Adds art from a catalog that arrived after the patches were parsed. */
export function withArtwork(patches: PatchNotesDetail[], artwork: NonNullable<PatchEntryContext['artwork']>): PatchNotesDetail[] {
  return patches.map(patch => ({ ...patch, entries: patch.entries.map(entry => ({ ...entry, artwork: artworkOf(entry, artwork) })) }));
}

const MAX_HISTORY = 6;

/**
 * Links each entry to earlier patches of the archive that changed the same
 * card: the same resolved card id, else the same name and subtitle in the mode.
 * `patches` is newest first, as the archive is sorted.
 */
export function withHistory(patches: PatchNotesDetail[]): PatchNotesDetail[] {
  const key = (entry: PatchNotesEntry) => (entry.cardId
    ? `${entry.mode}:${entry.cardId}`
    : `${entry.mode}:${entry.name.toLocaleLowerCase('ru-RU')}:${entry.subtitle ?? ''}`);
  const seen = new Map<string, PatchNotesEntry['history']>();
  const result: PatchNotesDetail[] = [];
  for (const patch of [...patches].reverse()) {
    const entries = patch.entries.map(entry => {
      const earlier = seen.get(key(entry)) ?? [];
      return { ...entry, history: earlier.slice(0, MAX_HISTORY) };
    });
    for (const entry of entries) {
      const earlier = seen.get(key(entry)) ?? [];
      if (earlier[0]?.version !== patch.version) {
        seen.set(key(entry), [{ version: patch.version, entryId: entry.id, publishedAt: patch.publishedAt }, ...earlier]);
      }
    }
    result.push({ ...patch, entries });
  }
  return result.reverse();
}
