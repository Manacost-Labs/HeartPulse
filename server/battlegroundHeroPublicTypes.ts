export type PublicBattlegroundHero = {
  dbfId: number;
  cardId: string | null;
  name: string;
  image: string | null;
  heroPower: {
    name: string;
    text: string | null;
    image: string | null;
  } | null;
};

export type PublicBattlegroundHeroCard = {
  name: string;
  text: string | null;
  image: string;
  imageGold: string | null;
};

/**
 * The open profile of one hero (`profile` of `GET /api/bg/heroes/public/:dbfId`): game content from the hero library,
 * copied by name (`battlegroundHeroPublicProfile.ts`). The patch history and statistics are not in the type.
 */
export type PublicBattlegroundHeroProfile = {
  artist: string | null;
  race: string | null;
  health: number | null;
  armor: { normal: number | null; duos: number | null } | null;
  /** The character's description from the library (English). */
  description: string | null;
  fullArt: string | null;
  buddy: (PublicBattlegroundHeroCard & { golden: PublicBattlegroundHeroCard | null }) | null;
  skins: Array<{ cardId: string | null; title: string; image: string; url: string | null }>;
  links: Array<{ label: string; url: string }>;
  /**
   * The hero's balance history («было → стало»), open by the owner's decision (as on card pages): the wiki change
   * groups in the library's shape (`wiki.card_changes`), so the page reads them with `battlegroundHeroPatchEntries`.
   */
  patches: Array<{
    heading: string | null;
    entries: Array<{ date: string | null; patch: string | null; patch_url: string | null; wiki_url: string | null; items: string[] }>;
  }>;
};

/**
 * The open statistics of one hero (`stats` of `GET /api/bg/heroes/public/:dbfId`):
 * the row of the hero in the open ranking of the base range, solo and duos.
 * Copied by name: the other rating ranges, the full placement distribution,
 * the anomaly-adjusted placement, compositions with metrics and the patch
 * history are not in the type and never reach a guest.
 */
export type PublicBattlegroundHeroModeStats = {
  tier: string;
  avgPlacement: number;
  /** Null in duos: the source has no eight-place distribution there. */
  top4Rate: number | null;
  pickRate: number | null;
  games?: number;
  bestComposition: string | null;
  keyMinions: string[];
  /** Place of the hero in the open ranking of the mode (1 is the best average place) and the size of that ranking. */
  rank: number;
  of: number;
};

export type PublicBattlegroundHeroStats = {
  mmr: 'TOP_50_PERCENT';
  /** Name of the hero power in the ranking row (a fact for the indexing rule). */
  heroPowerName: string | null;
  /** The older of the data dates of the modes present, ISO. */
  updatedAt: string | null;
  source: string;
  warning?: 'stale';
  modes: Partial<Record<'solo' | 'duos', PublicBattlegroundHeroModeStats>>;
};
