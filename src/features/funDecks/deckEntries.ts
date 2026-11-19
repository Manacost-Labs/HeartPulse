import type { DeckListCard, DeckListSideboard } from '../decklist/DeckListView';

/** A resolved card with the link to its page, which tokens and modules lack. */
export type FunDeckCard = DeckListCard & { pagePath?: string | null };

export type FunDeckEntry = {
  card: FunDeckCard;
  /** The mana a built Zilliax costs: the sum of its two modules. */
  configuredCost: number | null;
  /** Heading for the cards that travel with this one, such as the E.T.C. band. */
  sideboardLabel: string | null;
  sideboard: FunDeckCard[];
};

const ZILLIAX_ID = 'TOY_330';
const ZILLIAX_MODULE = /^TOY_330t9[2-9]$/;
const ETC_ID = 'ETC_080';

function byCost(left: FunDeckCard, right: FunDeckCard): number {
  return left.cost - right.cost || left.name.localeCompare(right.name, 'ru');
}

/**
 * The deck in reading order. A built Zilliax comes first with its two modules
 * (its cosmetic sideboard entry is not a card the player chose); every other
 * card follows the mana curve with its own sideboard, such as the E.T.C. band.
 */
export function funDeckEntries(cards: readonly FunDeckCard[], sideboards: readonly DeckListSideboard[] = []): FunDeckEntry[] {
  const boards = new Map(sideboards.map(board => [board.keyCardDbfId, board]));
  const entries = cards.map((card): FunDeckEntry => {
    const board = boards.get(card.dbfId);
    if (card.id === ZILLIAX_ID && board) {
      const modules = board.cards.filter(item => ZILLIAX_MODULE.test(item.id)).sort(byCost);
      return {
        card,
        configuredCost: modules.reduce((sum, item) => sum + item.cost, 0),
        sideboardLabel: 'Модули Зиллиакса',
        sideboard: modules,
      };
    }
    if (board?.cards.length) {
      return {
        card,
        configuredCost: null,
        sideboardLabel: card.id === ETC_ID ? 'Группа E.T.C.' : 'Доп. карты',
        sideboard: [...board.cards].sort(byCost),
      };
    }
    return { card, configuredCost: null, sideboardLabel: null, sideboard: [] };
  });
  const builtZilliax = (entry: FunDeckEntry) => (entry.configuredCost === null ? 1 : 0);
  return entries.sort((left, right) => builtZilliax(left) - builtZilliax(right) || byCost(left.card, right.card));
}

/** Main-deck copies per mana cost, 0 to 7+; a built Zilliax counts at its configured cost. */
export function funDeckManaCurve(entries: readonly FunDeckEntry[]): number[] {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const { card, configuredCost } of entries) buckets[Math.min(configuredCost ?? card.cost, 7)] += card.count;
  return buckets;
}

/** Card art served by the site in the sizes the deck views draw. */
export function funDeckCardArt(cardId: string, variant: 'row' | 'portrait'): string {
  return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=deck_art_v1`;
}
