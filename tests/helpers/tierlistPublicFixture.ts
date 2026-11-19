// A normalized Arena tier list (the shape `getTierlistApiData` caches) whose
// every paid figure is unique, so a test can look for it in any output. The
// first card carries the sentinel labels of the E21 rule: `pickRate: 61.234`
// (open since 2026-11-18, a guest reads 61,2), `winrate: 55.5555` (a guest
// reads 55,6) and the paid `mulliganWinrate: 58.765`, `arenaSmithRank: 4242`.

export const CLASS_IDS = ['death-knight', 'demon-hunter', 'druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman',
  'warlock', 'warrior'] as const;
export const UPDATED_AT = '2026-11-15T17:00:03.639Z';
// Not round on purpose: the exact figure is paid, its two-digit lower bound is what a guest may see.
export const MAX_GAMES = 987_654;
export const MAX_GAMES_AT_LEAST = 980_000;

/** Names of the paid fields: none of them is a key of the open projection, the HTML or the RSC payload. */
export const PAID_KEYS = ['playedWinrate', 'inDecks', 'totalGames', 'offerRate', 'discardRate', 'drawnWinrate', 'mulliganWinrate',
  'keptRate', 'avgCopies', 'arenaSmithTier', 'arenaSmithTierPosition', 'arenaSmithRank', 'arenaScore', 'deckWinrate', 'score'] as const;

type Row = Record<string, unknown>;
export type FixtureCard = { row: Row; classId: string; tier: string };

const round = (value: number, digits: number) => Number(value.toFixed(digits));
let counter = 0;
function card(classId: string, tier: string, key: string, score: number): FixtureCard {
  counter += 1;
  const n = counter;
  const row: Row = {
    cardId: `FX_${key}`, name: `Карта ${key}`, rarity: n % 2 ? 'rare' : 'epic', classKey: classId, source: 'hsreplay',
    score: round(score + n / 10_000, 4),
    winrate: round(50 + n * 0.0137 + 0.00031, 5),
    deckWinrate: round(51 + n * 0.0171 + 0.00047, 5),
    pickRate: round(30 + n * 0.0191 + 0.00061, 5),
    playedWinrate: round(52 + n * 0.0113 + 0.00053, 5),
    inDecks: round(20 + n * 0.0229 + 0.00073, 5),
    arenaScore: round(40 + n * 0.0231 + 0.00089, 5),
    totalGames: 100_000 + n * 7,
    offerRate: round(10 + n * 0.0317 + 0.00097, 5),
    discardRate: round(5 + n * 0.0043 + 0.00011, 5),
    drawnWinrate: round(53 + n * 0.0071 + 0.00013, 5),
    mulliganWinrate: round(54 + n * 0.0083 + 0.00017, 5),
    keptRate: round(70 + n * 0.0097 + 0.00019, 5),
    avgCopies: round(1.2 + n * 0.0031 + 0.00023, 5),
    arenaSmithTier: `Z${n}`,
    arenaSmithTierPosition: `Y${n}`,
    arenaSmithRank: 4_200_000 + n,
  };
  return { row, classId, tier };
}

/** Eight cards per class across tiers, neutral cards, a card without a tier (`U`) and the biggest sample. */
export function buildFixtureCards(): FixtureCard[] {
  counter = 0;
  const cards: FixtureCard[] = [];
  CLASS_IDS.forEach((classId, classIndex) => {
    for (let j = 0; j < 8; j += 1) {
      const tier = j < 2 ? 'A' : j < 5 ? 'B' : 'C';
      cards.push(card(classId, tier, `${classId}-${j}`, 90 - j * 5 - classIndex));
    }
  });
  cards.push(card('mage', 'S', 'mage-s0', 99), card('mage', 'S', 'mage-s1', 98));
  cards.push(card('any', 'S', 'any-s0', 96), card('any', 'B', 'any-b0', 60));
  cards.push(card('druid', 'U', 'druid-u', 100));
  const biggest = card('warrior', 'C', 'warrior-7', 1);
  biggest.row.totalGames = MAX_GAMES;
  cards.push(biggest);
  Object.assign(cards[0].row, { pickRate: 61.234, mulliganWinrate: 58.765, arenaSmithRank: 4242, winrate: 55.5555 });
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
    { imageHa: 'https://upstream.example/ha.png', imageRu: `/api/card-image/${item.row.cardId}/thumb.webp?v=1`, cost: 3, type: 'Существо' }]));
  return { sections, cards: lookup, updatedAt: UPDATED_AT, source: 'HSReplay' };
}

/** `55.5555` → `55,6`: what a guest reads. */
export const guestPercent = (value: unknown) => (Math.round(Number(value) * 10) / 10).toFixed(1).replace('.', ',');

/** The paid figures of every card (exact numbers, localized game counts) that must never reach a guest's page. */
export function closedValues(cards = buildFixtureCards()): string[] {
  const values: string[] = [];
  for (const { row } of cards) {
    for (const key of ['score', 'deckWinrate', 'playedWinrate', 'inDecks', 'arenaScore', 'offerRate', 'discardRate', 'drawnWinrate',
      'mulliganWinrate', 'keptRate', 'avgCopies', 'arenaSmithTier', 'arenaSmithTierPosition']) values.push(String(row[key]));
    // Unrounded winrate and pick rate: the open layer shows them to 0.1 only.
    values.push(String(row.winrate), String(row.pickRate));
    values.push(String(row.totalGames), Number(row.totalGames).toLocaleString('ru-RU'), String(row.arenaSmithRank));
  }
  return values;
}
