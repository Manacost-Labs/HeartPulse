/** One line of an open build's card list, as `/api/constructed-archetypes/public/:format/:slug` sends it. */
export type OpenDeckCard = { dbfId: number; name: string; cost: number; rarity: string; count: number };
