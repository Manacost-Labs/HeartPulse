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
  /** Only the open numbers of the default slice (`PublicCardOpenStats`); the paid fields are never in the seed. */
  stats: PublicCardOpenStats | null;
  statsUpdatedAt?: string | null;
  statsSourceUrl?: string | null;
};

/** The three statistics the anonymous card API opens for the default slice (last day, Legend). */
export type PublicCardOpenStats = { deckPopularity: number | null; deckWinrate: number | null; averageCopies: number | null };

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
 * shows what a reader sees after the page loads. Of the statistics only the open numbers come, with their date and source.
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
