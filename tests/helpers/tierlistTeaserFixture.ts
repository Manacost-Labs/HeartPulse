// A normalized Arena tier list (the shape `getTierlistApiData` caches) whose
// every figure is unique, so a test can look for it in any output. Cards are
// laid out so that the open slice (top ten, top three per class) is known.

export const CLASS_IDS = ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman',
  'warlock', 'warrior'] as const;
export const UPDATED_AT = '2026-11-15T17:00:03.639Z';
// Not round on purpose: the exact figure is closed, its two-digit lower bound is what a guest may see.
export const MAX_GAMES = 987_654;
export const MAX_GAMES_AT_LEAST = 980_000;

type Row = Record<string, unknown>;
export type FixtureCard = { row: Row; classId: string; tier: string };

let counter = 0;
function card(classId: string, tier: string, key: string, score: number): FixtureCard {
  counter += 1;
  const n = counter;
  const row: Row = {
    cardId: `FX_${key}`, name: `Карта ${key}`, rarity: 'rare', classKey: classId, source: 'hsreplay',
    score: Number((score + n / 10_000).toFixed(4)),
    winrate: Number((50 + n * 0.0137 + 0.00031).toFixed(5)),
    deckWinrate: Number((51 + n * 0.0171 + 0.00047).toFixed(5)),
    playedWinrate: Number((52 + n * 0.0113 + 0.00053).toFixed(5)),
    pickRate: Number((30 + n * 0.0191 + 0.00061).toFixed(5)),
    inDecks: Number((20 + n * 0.0229 + 0.00073).toFixed(5)),
    arenaScore: Number((40 + n * 0.0231 + 0.00089).toFixed(5)),
    totalGames: 100_000 + n * 7,
  };
  return { row, classId, tier };
}

/**
 * Six S cards (three Mage, two neutral, one Warlock) and the A cards of the first
 * four classes make the top ten; per class the best three are its S cards, then A, B.
 */
export function buildFixtureCards(): FixtureCard[] {
  counter = 0;
  const cards: FixtureCard[] = [];
  CLASS_IDS.forEach((classId, classIndex) => {
    for (let j = 0; j < 8; j += 1) {
      const tier = j < 2 ? 'A' : j < 5 ? 'B' : 'C';
      // A-tier cards of the first four classes make the overall top; the rest only the class lists.
      cards.push(card(classId, tier, `${classId}-${j}`, 90 - j * 5 - classIndex));
    }
  });
  cards.push(card('mage', 'S', 'mage-s0', 99), card('mage', 'S', 'mage-s1', 98), card('mage', 'S', 'mage-s2', 97));
  cards.push(card('any', 'S', 'any-s0', 96), card('any', 'S', 'any-s1', 95));
  cards.push(card('warlock', 'S', 'warlock-s0', 94));
  cards.push(card('druid', 'U', 'druid-u', 100));
  const biggest = card('warrior', 'C', 'warrior-7', 1);
  biggest.row.totalGames = MAX_GAMES;
  cards.push(biggest);
  return cards;
}

const TIERS = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'U'];

export function buildTierlistFixture(cards = buildFixtureCards()) {
  const sections = [...CLASS_IDS, 'any'].map(classId => ({
    id: classId, name: `Класс ${classId}`, color: '#000', textDark: false,
    tiers: TIERS.map(tier => ({
      tier, label: tier, description: '',
      cards: cards.filter(item => item.classId === classId && item.tier === tier).map(item => item.row)
        .sort((a, b) => Number(b.score) - Number(a.score)),
    })).filter(group => group.cards.length > 0),
    totalCards: cards.filter(item => item.classId === classId).length,
  }));
  const lookup = Object.fromEntries(cards.map(item => [item.row.cardId as string,
    { imageHa: 'https://upstream.example/ha.png', imageRu: `/api/card-image/${item.row.cardId}/thumb.webp?v=1`, cost: 3 }]));
  return { sections, cards: lookup, updatedAt: UPDATED_AT, source: 'HSReplay' };
}

/** The figures, and the names of the cards outside `visible`, that must never reach a guest's page. */
export function closedValues(visible: ReadonlySet<string>, cards = buildFixtureCards()): string[] {
  const values: string[] = [];
  for (const { row } of cards) {
    for (const key of ['score', 'winrate', 'deckWinrate', 'playedWinrate', 'pickRate', 'inDecks', 'arenaScore']) values.push(String(row[key]));
    values.push(String(row.totalGames), Number(row.totalGames).toLocaleString('ru-RU'));
    if (!visible.has(String(row.cardId))) values.push(String(row.cardId), String(row.name));
  }
  return values;
}
