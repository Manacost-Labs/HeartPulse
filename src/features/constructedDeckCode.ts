import { encode, type FormatType } from '@firestone-hs/deckstrings';

export type ConstructedDeckFormat = 'standard' | 'wild';
export type ConstructedHeroClass =
  | 'DEATHKNIGHT'
  | 'DEMONHUNTER'
  | 'DRUID'
  | 'HUNTER'
  | 'MAGE'
  | 'PALADIN'
  | 'PRIEST'
  | 'ROGUE'
  | 'SHAMAN'
  | 'WARLOCK'
  | 'WARRIOR';

export type ConstructedDeckCardInput = {
  dbfId: number;
  count: number;
};

export type ConstructedDeckSideboardInput = {
  keyCardDbfId: number;
  cards: ConstructedDeckCardInput[];
};

export const CONSTRUCTED_HERO_DBF: Record<ConstructedHeroClass, number> = {
  WARRIOR: 7,
  SHAMAN: 1066,
  ROGUE: 930,
  PALADIN: 671,
  HUNTER: 31,
  DRUID: 274,
  WARLOCK: 893,
  MAGE: 637,
  PRIEST: 813,
  DEMONHUNTER: 56550,
  DEATHKNIGHT: 78065,
};

export const CONSTRUCTED_HERO_BY_DBF = new Map(
  Object.entries(CONSTRUCTED_HERO_DBF).map(([heroClass, dbfId]) => (
    [dbfId, heroClass as ConstructedHeroClass] as const
  )),
);

const MAX_DBF_ID = 10_000_000;

function isValidDbfId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_DBF_ID;
}

function formatType(format: ConstructedDeckFormat): FormatType {
  return format === 'standard' ? 2 : 1;
}

export function normalizeConstructedHeroClass(value: unknown): ConstructedHeroClass | null {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s_-]+/g, '');
  return normalized in CONSTRUCTED_HERO_DBF ? normalized as ConstructedHeroClass : null;
}

export function encodeConstructedDeck({
  heroClass,
  format,
  cards,
  sideboards = [],
}: {
  heroClass: ConstructedHeroClass;
  format: ConstructedDeckFormat;
  cards: ConstructedDeckCardInput[];
  sideboards?: ConstructedDeckSideboardInput[];
}): string {
  return encode({
    format: formatType(format),
    heroes: [CONSTRUCTED_HERO_DBF[heroClass]],
    cards: cards
      .filter(card => isValidDbfId(card.dbfId) && Number.isSafeInteger(card.count) && card.count > 0)
      .map(card => [card.dbfId, card.count]),
    sideboards: sideboards
      .filter(sideboard => isValidDbfId(sideboard.keyCardDbfId) && sideboard.cards.length > 0)
      .map(sideboard => ({
        keyCardDbfId: sideboard.keyCardDbfId,
        cards: sideboard.cards
          .filter(card => isValidDbfId(card.dbfId) && Number.isSafeInteger(card.count) && card.count > 0)
          .map(card => [card.dbfId, card.count] as [number, number]),
      })),
  });
}
