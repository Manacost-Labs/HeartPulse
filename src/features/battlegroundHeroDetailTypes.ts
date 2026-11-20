/**
 * The shapes the hero detail page reads from the details API and the hero library.
 * Both sources are loose and differ between heroes, so every field is optional.
 */

export type BattlegroundHeroMediaItem = {
  key: string;
  title: string;
  image: string;
  kicker?: string;
  meta?: string;
  text?: string;
  link?: string;
};

export type BattlegroundHeroSoundClip = {
  description?: string | null;
  file_title?: string | null;
  file_url?: string | null;
  group?: string | null;
};

export type BattlegroundHeroSoundGroup = {
  heading?: string | null;
  clips?: BattlegroundHeroSoundClip[];
};

/** A hero power, a buddy or its golden copy. */
export type BattlegroundHeroDetailCard = {
  dbf?: number | string | null;
  card_id?: string | null;
  name?: string | null;
  text?: string | null;
  text_gold?: string | null;
  textGold?: string | null;
  golden?: { text?: string | null } | null;
  image?: string | null;
  image_gold?: string | null;
  crop_image?: string | null;
  cropImage?: string | null;
  art?: string | null;
  full_art?: string | null;
  fullArt?: string | null;
  full_image?: string | null;
  fullImage?: string | null;
  sounds?: BattlegroundHeroSoundGroup[] | null;
};

export type BattlegroundHeroSkin = {
  card_id?: string | null;
  title?: string | null;
  image?: string | null;
  url?: string | null;
};

export type BattlegroundHeroDetailLibraryHero = {
  dbf?: number | string | null;
  card_id?: string | null;
  name?: { ru?: string | null } | null;
  description?: string | null;
  character?: { description?: string | null } | null;
  race?: string | null;
  artist?: string | null;
  armor?: { normal?: number | string | null; duos?: number | string | null } | null;
  images?: { hero?: string | null; full_art?: string | null } | null;
  hero_power?: { card?: BattlegroundHeroDetailCard | null } | null;
  buddy?: { card?: BattlegroundHeroDetailCard | null; golden?: BattlegroundHeroDetailCard | null } | null;
  skins?: BattlegroundHeroSkin[] | null;
  wiki?: {
    page?: { url?: string | null } | null;
    external_links?: Array<{ label?: string | null; url?: string | null }> | null;
    card_changes?: unknown;
  } | null;
};

export type BattlegroundHeroDetailHeroStats = {
  hero?: string | null;
  tier?: string | null;
  pick_rate?: string | null;
  avg_placement?: number | string | null;
  best_composition?: string | null;
  placement_distribution?: unknown[] | null;
};

/** The HSReplay statistics of one hero; the analytics panels read the series themselves. */
export type BattlegroundHeroDetailStats = {
  mode?: string | null;
  filters?: { mmr_percentile?: string | null; time_range?: string | null } | null;
  hero?: BattlegroundHeroDetailHeroStats | null;
  combat_winrate?: unknown[] | null;
  hero_power_by_turn?: unknown[] | null;
  hero_power?: unknown[] | null;
  tavern_up_by_turn?: unknown[] | null;
  tavern_up?: unknown[] | null;
  compositions?: unknown[] | null;
  best_composition?: { lineup?: unknown[] | null; final_form_minions?: unknown[] | null } | null;
};
