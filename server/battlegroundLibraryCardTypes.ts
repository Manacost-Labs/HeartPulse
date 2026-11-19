/** The anonymous projection of a Battlegrounds library card (`projectPublicBattlegroundLibraryCard`), shared by the card, listing and sitemap readers. */
export type BattlegroundLibraryKind = 'minion' | 'spell';

export type PublicBattlegroundLibraryCard = {
  dbfId: number;
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
  images: {
    card: string | null;
    golden: string | null;
    art: string | null;
    framed: string | null;
    crop: string | null;
  };
  artist: string | null;
  inPool: boolean;
};
