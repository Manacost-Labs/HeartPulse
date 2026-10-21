import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classKey, classShareRows, contrastRatio, deckCount, deckDisplayLabel, withoutClass, groupBySiteTier, rankDelta, reportHighlights, reportWindowLabel, shareOfLeader,
  siteTier, thresholdPercent, type TierDeck, type TierSection,
} from '../src/features/viciousGold/viciousGoldModel';

const deck = (rank: number, winrate: number, name = `Deck ${rank}`): TierDeck => ({
  rank, winrate, deck: name, deckLabel: `Колода ${rank}`,
  class: 'Mage', classLabel: 'Маг', classIcon: 'mage', build: null,
});

test('Power Tier decks take the site tiers S–D from their vS power win rate', () => {
  assert.deepEqual([53, 52.99, 51, 50.99, 49, 48.99, 47, 46.99].map(siteTier),
    ['S', 'A', 'A', 'B', 'B', 'C', 'C', 'D']);
  const groups = groupBySiteTier([deck(1, 54.1), deck(2, 52.4), deck(3, 48.2), deck(4, 51.2), deck(5, 47.5)]);
  assert.deepEqual(groups.map(group => [group.tier, group.decks.map(item => item.rank)]),
    [['S', [1]], ['A', [2, 4]], ['C', [3, 5]]], 'empty tiers are left out and the source order is kept');
  assert.equal(groups[0].range, 'от 53%');
  assert.equal(groupBySiteTier([deck(9, 40)])[0].range, 'ниже 47%');
});

test('a rank bracket compares each deck with the same deck across all ranks', () => {
  const all: TierSection = { rankBracket: 'All ranks', rankLabel: 'Все ранги', decks: [deck(1, 55, 'A'), deck(2, 50, 'B')] };
  const legend: TierSection = { rankBracket: 'Legend', rankLabel: 'Легенда', decks: [deck(1, 53.5, 'B'), deck(2, 52, 'C')] };
  assert.equal(rankDelta(legend.decks[0], legend, [all, legend]), 3.5);
  assert.equal(rankDelta(legend.decks[1], legend, [all, legend]), null, 'a deck missing from all ranks has no baseline');
  assert.equal(rankDelta(all.decks[0], all, [all, legend]), null, 'all ranks is the baseline itself');
});

test('a class bar drops the class word from its archetype names', () => {
  assert.equal(classKey('DemonHunter'), 'demonhunter');
  assert.equal(classKey('Unknown'), null);
  assert.deepEqual(
    [['Жрец на воровстве', 'Жрец'], ['Анхоли Рыцарь Смерти', 'Рыцарь смерти'], ['Маг', 'Маг'], ['Маговор', 'Маг']]
      .map(([label, cls]) => withoutClass(label, cls)),
    ['На воровстве', 'Анхоли', 'Маг', 'Маговор'],
    'the class word goes, a name that is only the class or merely starts like it stays',
  );
});

test('the report header names its window and its leaders from the payload', () => {
  assert.equal(reportWindowLabel('lastDay'), 'последние 24 часа');
  assert.equal(reportWindowLabel('last2Weeks'), 'последние 2 недели');
  assert.equal(reportWindowLabel('nextYear'), null);
  assert.equal(reportWindowLabel(null), null);
  const highlights = reportHighlights({
    classDistribution: [{ class: 'Priest', classLabel: 'Жрец', classIcon: 'priest', frequency: 20.78 }],
    deckDistribution: [{ deck: 'Dragon Warrior', deckLabel: 'Дракон Воин', class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 11.11, build: null }],
    tierList: [{ rankBracket: 'All ranks', rankLabel: 'Все ранги', decks: [deck(1, 56.16, 'Pirate Warrior')] }],
  });
  assert.deepEqual(
    [highlights.leader?.deck, highlights.popular?.deck, highlights.topClass?.class],
    ['Pirate Warrior', 'Dragon Warrior', 'Priest'],
  );
  assert.deepEqual(reportHighlights({ classDistribution: [], deckDistribution: [], tierList: [] }),
    { leader: null, popular: null, topClass: null });
});

test('class bars are drawn against the leading class', () => {
  assert.equal(shareOfLeader(14.82, 14.82), '100%');
  assert.equal(shareOfLeader(7.41, 14.82), '50%');
  assert.equal(shareOfLeader(3, 0), '0%');
});

test('labels use Russian numbers and plurals', () => {
  assert.equal(thresholdPercent(0.5), '0,5%');
  assert.deepEqual([1, 3, 5, 21, 22, 11].map(deckCount), ['1 колода', '3 колоды', '5 колод', '21 колода', '22 колоды', '11 колод']);
});

test('class bars split a class into its archetypes in shades of the class colour with readable text', () => {
  const decks = [
    { deck: 'Control Priest', deckLabel: 'Контроль Жрец', class: 'Priest', classLabel: 'Жрец', classIcon: 'priest', frequency: 8, build: null },
    { deck: 'Quest Priest', deckLabel: 'Квест Жрец', class: 'Priest', classLabel: 'Жрец', classIcon: 'priest', frequency: 6, build: null },
    { deck: 'Dragon Warrior', deckLabel: 'Дракон Воин', class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 11, build: null },
  ];
  const rows = classShareRows([
    { class: 'Priest', classLabel: 'Жрец', classIcon: 'priest', frequency: 20 },
    { class: 'Warrior', classLabel: 'Воин', classIcon: 'warrior', frequency: 11 },
    { class: 'Hunter', classLabel: 'Охотник', classIcon: 'hunter', frequency: 2 },
  ], decks);
  assert.deepEqual(rows.map(row => [row.class, row.segments.map(segment => [segment.label, segment.frequency]), row.rest]), [
    ['Priest', [['Контроль', 8], ['Квест', 6]], 6],
    ['Warrior', [['Дракон', 11]], 0],
    ['Hunter', [], 2],
  ], 'archetypes below the threshold stay one honest "other" remainder');
  const [first, second] = rows[0].segments;
  assert.notEqual(first.background, second.background, 'each archetype has its own shade');
  for (const segment of rows.flatMap(row => row.segments)) {
    assert.ok(contrastRatio(segment.background, segment.ink) >= 4.5, `${segment.label}: text on ${segment.background} must reach 4.5:1`);
  }
});

test('bot and unnamed vS groups read as «Боты» and «Прочие» of their class', () => {
  const group = (deck: string, deckLabel = deck) => ({ deck, deckLabel, classLabel: 'Чернокнижник' });
  assert.equal(deckDisplayLabel(group('Bot Warlock')), 'Боты (Чернокнижник)');
  assert.equal(deckDisplayLabel(group('Other Warlock'), true), 'Прочие');
  assert.equal(deckDisplayLabel(group('Other Warlock', 'Прочие Чернокнижники')), 'Прочие Чернокнижники', 'a translation wins');
  assert.equal(deckDisplayLabel(group('Pig Warlock', 'Чернокнижник с Расхождением')), 'Чернокнижник с Расхождением');
});
