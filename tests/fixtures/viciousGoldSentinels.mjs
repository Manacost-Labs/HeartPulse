// The Vicious Gold report (#656) with a unique sentinel in every closed field, and the open frame it must give.
// Shared by tests/vicious-gold-public.test.ts (the API) and tests/next-vicious-gold-open-browser.test.mjs (HTML, RSC).

const build = {
  deckCode: 'SENTINEL_DECK_CODE', source: 'SENTINEL_BUILD_SOURCE', sourceLabel: 'SENTINEL_BUILD_LABEL',
  sourceUrl: 'https://sentinel.example/build', matchedArchetype: 'SENTINEL_MATCHED_ARCHETYPE', matchMethod: 'SENTINEL_MATCH_METHOD',
  updatedAt: 'SENTINEL_BUILD_UPDATED', winrate: 58.8001, sampleGames: 4441,
  deckCards: [{ name: 'SENTINEL_CARD_NAME', dbfId: 99991, count: 2 }],
};
const closedDeck = { rank: 7771, winrate: 59.9001, sampleGames: 6661, deckCode: 'SENTINEL_ROW_DECK_CODE', deckCards: ['SENTINEL_ROW_DECK_CARDS'] };

/** The paid report as `loadViciousGold` answers it, in the source's order (by share). */
export const REPORT = {
  title: 'Vicious Syndicate Gold', format: 'Standard', games: 917_331, source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', sourceId: 'SENTINEL_SOURCE_ID',
  updatedAt: '2026-11-20T08:15:00.000Z', minimumDeckFrequency: 0.4917, extra: 'SENTINEL_TOP_EXTRA',
  timeRanges: { distribution: 'lastDay', tierLadder: 'lastWeek', tierMatchups: 'last2Weeks', extra: 'SENTINEL_RANGE_EXTRA' },
  classDistribution: [
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 31.4159, extra: 'SENTINEL_CLASS_EXTRA' },
    { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight', frequency: 27.1828 },
    // Two classes with one name: the key decides, not the share.
    { class: 'PaladinTwin', classLabel: 'Паладин', classIcon: 'paladin', frequency: 21.0001 },
    { class: 'Paladin', classLabel: 'Паладин', classIcon: 'paladin', frequency: 19.0002 },
    { class: 'Mage', classLabel: 'Маги', classIcon: 'mage', frequency: 16.1803 },
    // The same class twice: the smaller name is kept, whichever comes first.
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', frequency: 1.2345 },
  ],
  deckDistribution: [
    { deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', archetypeSlug: 'dragon-warrior', class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 12.3457, build, ...closedDeck, extra: 'SENTINEL_DECK_EXTRA' },
    { deck: 'Blood Death Knight', deckLabel: 'Рыцарь смерти крови', archetypeSlug: 'blood-dk', class: 'DeathKnight',
      classLabel: 'Рыцарь смерти', classIcon: 'death-knight', frequency: 9.8765, build: null },
    // Three archetypes with one name: the slug decides (none first), not the share.
    { deck: 'Face Warrior', deckLabel: 'Агро Воин', archetypeSlug: 'face-warrior', class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 8.7654, build: null },
    { deck: 'Aggro Warrior', deckLabel: 'Агро Воин', archetypeSlug: 'aggro-warrior', class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 7.6543, build: null },
    { deck: 'Control Warrior', deckLabel: 'Агро Воин', archetypeSlug: null, class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 7.0001, build: null },
    { deck: 'Protoss Mage', deckLabel: 'Протосс Маг', archetypeSlug: '<script>', class: 'Mage', classLabel: 'Маги',
      classIcon: 'mage', frequency: 5.4321, build: null },
    // The same archetype twice: the smaller name is kept, whichever comes first.
    { deck: 'Dragon Warrior', deckLabel: 'Яркий Воин', archetypeSlug: 'zz', class: 'Warrior', classLabel: 'Воин',
      classIcon: 'warrior', frequency: 4.4444, build: null },
    { deck: 'Holy Paladin', deckLabel: 'Святой Паладин', archetypeSlug: 'holy-paladin', class: 'PaladinTwin', classLabel: 'Паладин',
      classIcon: 'paladin', frequency: 3.3333, build: null },
    // A class only an archetype names.
    { deck: 'Cycle Rogue', deckLabel: 'Циклоразбойник', archetypeSlug: 'cycle-rogue', class: 'Rogue', classLabel: 'Разбойник',
      classIcon: 'rogue', frequency: 2.2222, build: null },
  ],
  tierList: [
    { rankBracket: 'Legend', rankLabel: 'Легенда-2', note: 'SENTINEL_TIER_EXTRA', decks: [
      { rank: 1, deck: 'SENTINEL_TIER_ONLY_DECK', deckLabel: 'SENTINEL_TIER_ONLY_LABEL', class: 'Mage', winrate: 56.7891, build },
    ] },
    { rankBracket: 'All ranks', rankLabel: 'Все ранги', decks: [
      { rank: 1, deck: 'Protoss Mage', deckLabel: 'Протосс Маг', class: 'Mage', winrate: 54.3219, build: null },
      { rank: 2, deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', class: 'Warrior', winrate: 52.1098, build },
    ] },
    { rankBracket: 'Mystery bracket', rankLabel: 'Тайный', decks: [] },
    { rankBracket: 'Platinum', rankLabel: 'Платина', decks: [] },
    { rankBracket: 'Legend', rankLabel: 'Легенда', decks: [] },
  ],
  buildCoverage: { found: 3_331, total: 3_332 },
};

/** The open answer of `REPORT`, byte for byte (key order included). */
export const OPEN_FRAME = {
  title: 'Vicious Syndicate Gold', format: 'Standard', source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', updatedAt: '2026-11-20T08:15:00.000Z',
  timeRanges: { distribution: 'lastDay', tierLadder: 'lastWeek', tierMatchups: 'last2Weeks' },
  classes: [
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior' },
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage' },
    { class: 'Paladin', classLabel: 'Паладин', classIcon: 'paladin' },
    { class: 'PaladinTwin', classLabel: 'Паладин', classIcon: 'paladin' },
    { class: 'Rogue', classLabel: 'Разбойник', classIcon: 'rogue' },
    { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight' },
  ],
  archetypes: [
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Control Warrior', deckLabel: 'Агро Воин', archetypeSlug: null },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Aggro Warrior', deckLabel: 'Агро Воин', archetypeSlug: 'aggro-warrior' },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Face Warrior', deckLabel: 'Агро Воин', archetypeSlug: 'face-warrior' },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', deck: 'Dragon Warrior', deckLabel: 'Драконий Воин', archetypeSlug: 'dragon-warrior' },
    { class: 'Mage', classLabel: 'Маг', classIcon: 'mage', deck: 'Protoss Mage', deckLabel: 'Протосс Маг', archetypeSlug: null },
    { class: 'PaladinTwin', classLabel: 'Паладин', classIcon: 'paladin', deck: 'Holy Paladin', deckLabel: 'Святой Паладин', archetypeSlug: 'holy-paladin' },
    { class: 'Rogue', classLabel: 'Разбойник', classIcon: 'rogue', deck: 'Cycle Rogue', deckLabel: 'Циклоразбойник', archetypeSlug: 'cycle-rogue' },
    { class: 'DeathKnight', classLabel: 'Рыцарь смерти', classIcon: 'death-knight', deck: 'Blood Death Knight', deckLabel: 'Рыцарь смерти крови', archetypeSlug: 'blood-dk' },
  ],
  rankBrackets: [
    { rankBracket: 'All ranks', rankLabel: 'Все ранги' },
    { rankBracket: 'Legend', rankLabel: 'Легенда' },
    { rankBracket: 'Platinum', rankLabel: 'Платина' },
    { rankBracket: 'Mystery bracket', rankLabel: 'Тайный' },
  ],
};

/** Every closed value of `REPORT` as it would be printed raw or in ru-RU. */
export const CLOSED_VALUES = [
  'SENTINEL', '917331', '917 331', '917 331', '0.4917', '0,4917', '3331', '3332',
  '31.4159', '27.1828', '21.0001', '19.0002', '16.1803', '1.2345', '12.3457', '9.8765', '8.7654', '7.6543', '7.0001',
  '5.4321', '4.4444', '3.3333', '2.2222', '58.8001', '59.9001', '56.7891', '54.3219', '52.1098', '4441', '6661', '7771', '99991',
  '31,41', '27,18', '12,34', '58,80', '59,90', '56,78', '54,32', '52,10', 'sentinel.example', 'Яркий Воин', 'Маги', 'Легенда-2',
];
/** Closed field names; an open answer that has one carries a closed value. */
export const CLOSED_KEYS = ['frequency', 'games', 'winrate', 'rank', 'minimumDeckFrequency', 'buildCoverage', 'build', 'deckCode',
  'deckCards', 'sampleGames', 'tierList', 'decks', 'sourceId', 'sourceLabel', 'matchedArchetype', 'matchMethod', 'extra', 'note'];

const reversed = list => [...list].reverse();
const rotated = list => [...list.slice(3), ...list.slice(0, 3)];
/** The same report in other source orders: every list reversed, or rotated; the open answer must not change. */
export const PERMUTED_REPORTS = {
  reversed: { ...REPORT, classDistribution: reversed(REPORT.classDistribution), deckDistribution: reversed(REPORT.deckDistribution),
    tierList: reversed(REPORT.tierList) },
  rotated: { ...REPORT, classDistribution: rotated(REPORT.classDistribution), deckDistribution: rotated(REPORT.deckDistribution),
    tierList: rotated(REPORT.tierList) },
};

/**
 * An open answer that carries every closed field by mistake (next to the open fields, at every level): a page must
 * rebuild the frame field by field, so none of them may reach its HTML or RSC payload.
 */
export const MISTAKEN_OPEN_ANSWER = {
  ...OPEN_FRAME, games: REPORT.games, minimumDeckFrequency: REPORT.minimumDeckFrequency, buildCoverage: REPORT.buildCoverage,
  sourceId: REPORT.sourceId, extra: REPORT.extra, tierList: REPORT.tierList,
  timeRanges: { ...OPEN_FRAME.timeRanges, extra: REPORT.timeRanges.extra },
  classes: OPEN_FRAME.classes.map((item, index) => ({ ...item, frequency: REPORT.classDistribution[index].frequency, extra: 'SENTINEL_CLASS_EXTRA' })),
  archetypes: OPEN_FRAME.archetypes.map((item, index) => ({ ...item, frequency: REPORT.deckDistribution[index].frequency, build, ...closedDeck })),
  rankBrackets: OPEN_FRAME.rankBrackets.map(item => ({ ...item, decks: REPORT.tierList[1].decks, note: 'SENTINEL_TIER_EXTRA' })),
};

/**
 * The closed values a page could print, raw (an RSC payload) or as the report formats them (ru-RU, two decimals),
 * without the bare integers, which a chunk hash in the HTML may contain by chance.
 */
export const CLOSED_HTML_VALUES = [
  'SENTINEL', 'sentinel.example', 'Яркий Воин', 'Легенда-2', '917 331', '917 331', '0.4917', '0,4917',
  '31.4159', '27.1828', '21.0001', '19.0002', '16.1803', '1.2345', '12.3457', '9.8765', '8.7654', '7.6543', '7.0001',
  '5.4321', '4.4444', '3.3333', '2.2222', '58.8001', '59.9001', '56.7891', '54.3219', '52.1098',
  '31,42', '27,18', '16,18', '12,35', '9,88', '8,77', '7,65', '5,43', '4,44', '3,33', '2,22', '58,80', '59,90', '56,79', '54,32', '52,11',
];

/**
 * The closed integers (rank, games, sample games, build coverage, a card's dbfId). Bare, they could match a chunk id or
 * hash by chance, so a page is checked for them where a value sits: after a JSON key (`:7771`, also escaped in the RSC
 * payload) or as a cell's text (`>7771<`).
 */
export const CLOSED_INTEGERS = [917_331, 3_331, 3_332, 7_771, 6_661, 4_441, 99_991];
export const CLOSED_INTEGER_PATTERN = new RegExp(`(?::\\s*|>\\s*)(?:${CLOSED_INTEGERS.join('|')})(?!\\d|[.,]\\d)`, 'g');
/** A closed field name as a JSON key, plain or escaped inside the RSC payload's strings. */
export const closedKeyPattern = key => new RegExp(`\\\\?"${key}\\\\?"\\s*:`);
