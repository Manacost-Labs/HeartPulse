import type { PatchNotesDetail, PatchNotesEntry } from './contract.js';
import { nameKey, splitCardName } from './cardNames.js';

/**
 * Cards of a patch that the collectible dictionary does not know: tokens,
 * hero-power spells, cards of a rotated-out mode. The article names them, and
 * the full HearthstoneJSON catalog of the data API (`/card-catalog?q=`) finds
 * them. Each name is asked once; an answer is kept (a miss for a shorter time).
 */

export type CatalogCard = {
  id: string;
  cardClass: string | null;
  cardType: string | null;
  /** The catalog's own spelling, with its straight apostrophe. */
  name: string;
  renderUrl: string | null;
};

type Row = Record<string, unknown>;

const FOUND_TTL_MS = 24 * 60 * 60_000;
const MISS_TTL_MS = 10 * 60_000;
const MAX_NAMES = 400;
const MAX_CONCURRENT = 4;
/** An enchantment has no card face; the others come in the order a patch most often means them. */
const TYPE_ORDER = ['spell', 'minion', 'weapon', 'hero', 'location', 'hero_power'];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const lower = (value: unknown) => text(value).toLowerCase();

/** The catalog card a name means: an exact name match with a face, preferring the type the article's words suggest. */
export function pickCatalogCard(rows: unknown, name: string, ability: boolean): CatalogCard | null {
  if (!Array.isArray(rows)) return null;
  const wanted = nameKey(name);
  const rank = (type: string) => (ability && type === 'spell' ? -1 : TYPE_ORDER.indexOf(type) === -1 ? TYPE_ORDER.length : TYPE_ORDER.indexOf(type));
  const found = (rows as Row[]).flatMap(row => {
    const card = (row.name ?? {}) as Row;
    const images = (row.images ?? {}) as Row;
    const id = text(row.card_id);
    const render = /^https:\/\//i.test(text(images.card)) ? text(images.card) : null;
    const type = lower((row.card_type as Row | undefined)?.slug);
    return id && render && type !== 'enchantment' && nameKey(text(card.ru)) === wanted
      ? [{ id, cardClass: text(row.class) || null, cardType: type || null, name: text(card.ru), renderUrl: render }]
      : [];
  });
  return found.sort((left, right) => rank(left.cardType ?? '') - rank(right.cardType ?? ''))[0] ?? null;
}

export type CatalogCardsDependencies = {
  /** Reads a data API path; rejects on any failure. */
  fetchJson: (url: string) => Promise<unknown>;
  baseUrl: string;
  now?: () => number;
};

/** An entry the dictionary left without a card, outside the Battlegrounds catalog. */
const wanted = (entry: PatchNotesEntry) => entry.cardId === null && entry.mode !== 'battlegrounds';

export function createCatalogCards({ fetchJson, baseUrl, now = Date.now }: CatalogCardsDependencies) {
  const known = new Map<string, { card: CatalogCard | null; until: number }>();
  const reading = new Map<string, Promise<void>>();

  const read = (base: string, ability: boolean): Promise<void> => {
    const key = nameKey(base);
    let task = reading.get(key);
    if (!task) {
      // The catalog spells apostrophes straight; a curly one finds nothing.
      const query = new URLSearchParams({ q: base.replace(/[’‘`]/g, "'"), per_page: '20' });
      task = fetchJson(`${baseUrl}/card-catalog?${query}`).then(
        payload => {
          const card = pickCatalogCard((payload as { data?: unknown })?.data, base, ability);
          known.set(key, { card, until: now() + (card ? FOUND_TTL_MS : MISS_TTL_MS) });
        },
        () => { known.set(key, { card: null, until: now() + MISS_TTL_MS / 2 }); },
      ).finally(() => reading.delete(key));
      reading.set(key, task);
    }
    return task;
  };

  const fresh = (base: string) => (known.get(nameKey(base))?.until ?? 0) > now();

  return {
    /** True while a catalog read is still running: an answer built now may lack cards a later one has. */
    pending: () => reading.size > 0,
    /**
     * The patches with the cards known within `waitMs`; the reads go on in the background, and the next call
     * (which joins them rather than repeating them) finds the rest. Never rejects.
     */
    async fillWithin(patches: PatchNotesDetail[], waitMs: number): Promise<PatchNotesDetail[]> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([this.load(patches), new Promise(done => { timer = setTimeout(done, waitMs); })]);
      clearTimeout(timer);
      return this.fill(patches);
    },
    /** Reads the catalog for every card of the patches that still has no card; never rejects. */
    async load(patches: PatchNotesDetail[]): Promise<void> {
      const names = new Map<string, boolean>();
      for (const entry of patches.flatMap(patch => patch.entries).filter(wanted)) {
        const { base, qualifier } = splitCardName(entry.name);
        if (!fresh(base)) names.set(base, names.get(base) === true || qualifier !== null);
      }
      const queue = [...names].slice(0, MAX_NAMES);
      const worker = async () => {
        for (let item = queue.shift(); item; item = queue.shift()) await read(item[0], item[1]);
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, worker));
    },
    /** The patches with the cards read so far; a card still unknown keeps the article's name and no picture. */
    fill(patches: PatchNotesDetail[]): PatchNotesDetail[] {
      return patches.map(patch => (patch.entries.some(wanted)
        ? { ...patch, entries: patch.entries.map(entry => fillEntry(entry, known)) }
        : patch));
    },
  };
}

function fillEntry(entry: PatchNotesEntry, known: Map<string, { card: CatalogCard | null; until: number }>): PatchNotesEntry {
  if (!wanted(entry)) return entry;
  const { base, qualifier } = splitCardName(entry.name);
  const card = known.get(nameKey(base))?.card;
  if (!card) return entry;
  return {
    ...entry,
    // "Гнев К’Туна — Способность К’Туна": the card's name, and whose ability it is as its line.
    name: qualifier ? base : entry.name,
    subtitle: qualifier ? [entry.subtitle, qualifier].filter(Boolean).join(' · ') : entry.subtitle,
    cardId: card.id, cardClass: card.cardClass, cardType: card.cardType, renderUrl: card.renderUrl,
    // Not in the collection, so in neither format's catalog.
    format: null,
  };
}
