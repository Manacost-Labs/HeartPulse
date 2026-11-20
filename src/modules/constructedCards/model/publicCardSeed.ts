/** Public server-rendering input. Paid fields and account state are deliberately absent. */
export type PublicCardSeed = {
  card_id: string;
  dbf: number | null;
  name: { ru: string; en: string | null };
  text: { ru: string | null };
  flavor: { ru: string | null };
  /** The class code; null for a card of several classes, as in the full record. */
  class: string | null;
  card_set: string | null;
  card_type: { name_ru: string | null };
  rarity: string | null;
  mana_cost: number | null;
  attack: number | null;
  health: number | null;
  durability: number | null;
  armor: number | null;
  artist: string | null;
  images: { card: string | null; crop?: string | null; tile?: string | null; horizontal?: string | null };
  stats: null;
};

/** A deck with the card as the anonymous card API gives it: no winrate, no score. */
export type PublicCardDeckSeed = {
  id: string;
  title: string;
  archetype: string | null;
  archetypeLabel: string | null;
  className: string | null;
  deckCode: string;
  winrate: null;
  score: null;
};

/**
 * The seed plus the open part of the card record that the browser would load
 * anyway (mechanics, patch history, related cards, decks), so the server HTML
 * shows what a reader sees after the page loads. Statistics stay absent.
 */
export type PublicCardDetailSeed = Omit<PublicCardSeed, 'images'> & {
  images: PublicCardSeed['images'] & {
    golden?: string; signature?: string; diamond?: string; animated?: Record<string, string>;
  };
  formats: Array<{ slug: string; name_ru?: string; name_en?: string }>;
  mechanics: string[];
  referenced_tags: string[];
  minion_type: string | null;
  spell_school: string | null;
  wiki: Record<string, unknown>;
  wiki_page: { title: string | null; url: string | null } | null;
  related_cards_localized: unknown[];
  decks: PublicCardDeckSeed[];
  mechanicTranslations: Record<string, string>;
  mechanicOverrides: Record<string, string>;
};
