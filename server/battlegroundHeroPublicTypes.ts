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
