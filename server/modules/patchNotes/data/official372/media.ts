import type { PatchNotesPoolItem, PatchNotesSectionImage } from '../../contract.js';

/**
 * Illustrations of patch 37.2 kept with the site (`public/assets/patch-notes/37-2/`): the `ru-*`
 * overviews with translated card text come from the Manacost Telegram channel (t.me/manacost_ru,
 * posts 7903–7910), the banners from the official Blizzard article. Card renders are not stored:
 * new pool cards use the official library (`officialRenders.ts`), the rest the catalogs.
 */
const ASSET_ROOT = '/assets/patch-notes/37-2';

/** Pixel size of every stored illustration, so the page reserves its box before the picture loads. */
const BANNER_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  's15-marquee': [760, 608],
  'ru-deity-nzoth': [800, 576],
  'ru-event-cards': [705, 800],
  'ru-event-new-year': [705, 800],
  'ru-event-winter-veil': [705, 800],
  'ru-event-yshaarj': [705, 800],
  'ru-hero-eternus': [800, 576],
  'ru-hero-vanessa': [800, 576],
  'ru-invocations': [800, 576],
  'ru-invocations-2': [800, 576],
  'ru-mission': [800, 576],
  'ru-resilient': [800, 576],
  'brawl-2v2': [760, 428],
  'heroic-brawl': [760, 380],
  'celestial-yogg': [760, 428],
  'ranked-skins': [760, 427],
  'rewards-track': [760, 428],
};

export function banner(file: string, alt: string): PatchNotesSectionImage {
  const size = BANNER_SIZES[file];
  if (!size) throw new Error(`patch 37.2: unknown illustration ${file}`);
  return { url: `${ASSET_ROOT}/${file}.webp`, alt, shape: 'banner', width: size[0], height: size[1] };
}

/** A Battlegrounds hero by its catalog id; the page shows its portrait. */
export const hero = (name: string, cardId: string, text?: string): PatchNotesPoolItem => ({
  name, cardId, cardType: 'hero', ...(text ? { text } : {}),
});

/** A card resolved by its English name against the Battlegrounds catalog. */
export const bgCard = (name: string, sourceName: string): PatchNotesPoolItem => ({ name, sourceName });

/** A card the catalogs do not list under its name (a hero power, a quest reward): its Russian Battlegrounds render. */
export const cardById = (name: string, cardId: string, cardType: string): PatchNotesPoolItem => ({
  name, cardId, cardType, renderUrl: `https://art.hearthstonejson.com/v1/bgs/latest/ruRU/512x/${encodeURIComponent(cardId)}.png`,
});

/** A hero skin of the kolodahs library, which keeps a static render of every skin. */
export const heroSkin = (name: string, sourceName: string, cardId: string): PatchNotesPoolItem => ({
  name,
  sourceName,
  cardId,
  cardType: 'hero-skin',
  renderUrl: `https://api.kolodahearthstone.com/uploads/hero-skins/static/${encodeURIComponent(cardId)}.png`,
});
