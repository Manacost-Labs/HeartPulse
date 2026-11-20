import type { CardLookup, ClassSection, TierCard, TierlistData } from '@/src/modules/arenaTierList/public';
import type { PublicTierlist } from './publicTierlistData';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'];

/** One card of the open pool as the page sends it to the browser: cardId, name, tier, cost, rarity, type, winrate, pick rate. */
type CompactCard = [string, string, string, number | null, string | null, string | null, number | null, number | null];

/**
 * The open tier list in the form the page hands to its client view. The whole pool travels in the RSC
 * payload, so it is written as rows without repeated keys: about half the bytes of the parsed objects,
 * which keeps the document of a 1300-card pool under its 300 KB budget.
 */
export type CompactTierlist = {
  updatedAt: string | null;
  sampleGamesAtLeast: number | null;
  classes: Array<[string, string, CompactCard[]]>;
};

export function compactTierlist(pool: PublicTierlist): CompactTierlist {
  return {
    updatedAt: pool.updatedAt,
    sampleGamesAtLeast: pool.sampleGamesAtLeast,
    classes: pool.classes.map(entry => [entry.id, entry.name, entry.cards.map(card =>
      [card.cardId, card.name, card.tier, card.cost, card.rarity, card.type, card.winrate, card.pickRate] satisfies CompactCard)]),
  };
}

/**
 * The pool of a class page (`/tierlist/<class>/`): the cards of that class only, so the page's data stays small,
 * and every other class kept with no cards, so the class choice still names them all (as links to their pages).
 */
export function compactTierlistClass(pool: PublicTierlist, classId: string): CompactTierlist {
  const compact = compactTierlist(pool);
  return { ...compact, classes: compact.classes.map(([id, name, rows]) => [id, name, id === classId ? rows : []]) };
}

/**
 * The open tier list in the shape the subscriber's view (`TierList`) reads, so a viewer without access
 * gets the same view on the open figures: tier, winrate, pick rate, cost, rarity and type. The paid
 * figures are simply absent here; the view shows them as locks. The order inside a tier is the projection's.
 */
export function openTierlistView(pool: CompactTierlist): TierlistData {
  const cards: Record<string, CardLookup> = {};
  const sections: ClassSection[] = pool.classes.map(([id, name, rows]) => {
    const tiers = TIER_ORDER.flatMap(tier => {
      const group: TierCard[] = rows.filter(row => row[2] === tier).map(([cardId, cardName, , cost, rarity, type, winrate, pickRate]) => {
        cards[cardId] ??= {
          imageHa: '', imageRu: null,
          ...(cost === null ? {} : { cost }),
          ...(type ? { type } : {}),
        };
        return {
          name: cardName, cardId, classKey: id, rarity: rarity ?? 'common', score: null,
          source: 'hsreplay', statsContext: 'tierlist',
          ...(winrate === null ? {} : { winrate }),
          pickRate,
        };
      });
      return group.length ? [{ tier, label: tier, description: '', cards: group }] : [];
    });
    return { id, name, color: '#5a3000', textDark: false, tiers,
      totalCards: tiers.reduce((sum, tier) => sum + tier.cards.length, 0) };
  });
  return { sections, cards, updatedAt: pool.updatedAt, source: 'hsreplay' };
}
