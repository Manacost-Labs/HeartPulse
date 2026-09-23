/** Public server-rendering input. Paid fields and account state are deliberately absent. */
export type PublicCardSeed = {
  card_id: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
  text: { ru: string | null };
  flavor: { ru: string | null };
  class: string;
  card_set: string | null;
  card_type: { name_ru: string | null };
  rarity: string | null;
  mana_cost: number | null;
  attack: number | null;
  health: number | null;
  durability: number | null;
  armor: number | null;
  artist: string | null;
  images: { card: string | null };
  stats: null;
};
