/** The anonymous projection of a Battlegrounds library card (`projectPublicBattlegroundLibraryCard`), shared by the card, listing and sitemap readers. */
export type BattlegroundLibraryKind = 'minion' | 'spell';

export type PublicBattlegroundLibraryCard = {
  dbfId: number;
  /** The catalog card id (`BG26_146`), which names its pictures; `null` when the catalog has none. */
  cardId: string | null;
  kind: BattlegroundLibraryKind;
  typeName: string;
  nameRu: string;
  nameEn: string | null;
  textRu: string | null;
  textEn: string | null;
  tavernTier: number | null;
  tribe: string | null;
  attack: number | null;
  health: number | null;
  mechanics: string[];
  /** The golden version's attack and health, when the catalog has one (a fact of the open card page). */
  golden: { attack: number | null; health: number | null } | null;
  images: {
    card: string | null;
    golden: string | null;
    art: string | null;
    framed: string | null;
    crop: string | null;
  };
  artist: string | null;
  inPool: boolean;
  /** A card of the Duos mode only. */
  duosOnly: boolean;
};
