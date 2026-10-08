// A Vicious Gold answer shaped like production: 11 classes, 28 archetypes above 0.5%, six rank brackets and four win-rate bands.
const CLASS_RU = { DeathKnight: 'Рыцарь смерти', DemonHunter: 'Охотник на демонов', Druid: 'Друид', Hunter: 'Охотник', Mage: 'Маг', Paladin: 'Паладин', Priest: 'Жрец', Rogue: 'Разбойник', Shaman: 'Шаман', Warlock: 'Чернокнижник', Warrior: 'Воин' };
const icon = c => c.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
const classes = [['Warrior', 14.82], ['Mage', 12.4], ['DeathKnight', 11.06], ['Paladin', 10.35], ['Rogue', 9.71], ['DemonHunter', 8.9], ['Shaman', 8.12], ['Priest', 7.44], ['Druid', 6.58], ['Hunter', 5.67], ['Warlock', 4.95]];
const decks = [
  ['Dragon Warrior', 'Драконий Воин', 'Warrior', 7.9], ['Protoss Mage', 'Протосс Маг', 'Mage', 6.8], ['Blood Death Knight', 'Рыцарь смерти крови', 'DeathKnight', 6.2], ['Handbuff Paladin', 'Баффающий Паладин', 'Paladin', 5.9],
  ['Cycle Rogue', 'Циклоразбойник', 'Rogue', 5.4], ['Control Warrior', 'Контроль Воин', 'Warrior', 4.9], ['Spell Demon Hunter', 'Охотник на демонов на заклинаниях', 'DemonHunter', 4.6], ['Elemental Shaman', 'Шаман элементалей', 'Shaman', 4.3],
  ['Imbue Priest', 'Насыщающий Жрец', 'Priest', 3.9], ['Starship Death Knight', 'Звездолётный Рыцарь смерти', 'DeathKnight', 3.7], ['Arcane Mage', 'Тайный Маг', 'Mage', 3.5], ['Dragon Druid', 'Драконий Друид', 'Druid', 3.3],
  ['Aggro Demon Hunter', 'Агро Охотник на демонов', 'DemonHunter', 3.1], ['Pirate Rogue', 'Пиратский Разбойник', 'Rogue', 2.9], ['Aura Paladin', 'Аура Паладин', 'Paladin', 2.7], ['Beast Hunter', 'Охотник на зверей', 'Hunter', 2.6],
  ['Zarimi Priest', 'Зарими Жрец', 'Priest', 2.3], ['Wishing Well Shaman', 'Шаман колодца желаний', 'Shaman', 2.1], ['Ramp Druid', 'Рамп Друид', 'Druid', 1.9], ['Discover Hunter', 'Охотник на раскопке', 'Hunter', 1.8],
  ['Wallow Warlock', 'Чернокнижник гниения', 'Warlock', 1.7], ['Excavate Warrior', 'Раскопочный Воин', 'Warrior', 1.4], ['Big Spell Mage', 'Маг больших заклинаний', 'Mage', 1.2], ['Pain Warlock', 'Чернокнижник боли', 'Warlock', 1.1],
  ['Other Paladin', 'Прочие Паладины', 'Paladin', 0.9], ['Totem Shaman', 'Тотемный Шаман', 'Shaman', 0.8], ['Other Warlock', 'Прочие Чернокнижники', 'Warlock', 0.7], ['Rainbow Death Knight', 'Радужный Рыцарь смерти', 'DeathKnight', 0.6],
];
const row = ([deck, deckLabel, cls]) => ({ deck, deckLabel, class: cls, classLabel: CLASS_RU[cls], classIcon: icon(cls) });
const brackets = [['All ranks', 'Все ранги'], ['Legend', 'Легенда'], ['Diamond 1-4', 'Алмаз 1–4'], ['Diamond 5-10', 'Алмаз 5–10'], ['Platinum', 'Платина'], ['Gold Silver Bronze', 'Золото, Серебро, Бронза']];
const ranked = decks.filter(d => !/^Other /.test(d[0]));
export const summary = {
  title: 'Vicious Syndicate Gold', format: 'Standard', games: 1284563, source: 'Vicious Syndicate Live',
  sourceUrl: 'https://www.vicioussyndicate.com/data-reaper-live/', updatedAt: '2026-10-08T06:12:00.000Z', minimumDeckFrequency: 0.5,
  classDistribution: classes.map(([cls, frequency]) => ({ class: cls, classLabel: CLASS_RU[cls], classIcon: icon(cls), frequency })),
  deckDistribution: decks.map(d => ({ ...row(d), frequency: d[3], build: null })),
  tierList: brackets.map(([rankBracket, rankLabel], b) => ({
    rankBracket, rankLabel,
    decks: ranked.map((d, i) => ({ d, wr: 54.6 - i * 0.42 + (((i * 7 + b * 3) % 5) - 2) * 0.35 }))
      .sort((x, y) => y.wr - x.wr).map(({ d, wr }, i) => ({ rank: i + 1, ...row(d), winrate: +wr.toFixed(2), build: null })),
  })),
  buildCoverage: { found: 0, total: decks.length },
};
const CODE = 'AAECAf0EBK/ABtH4BsvhBqfTBw2P9AaM9AaQ9AaY9Aaa9Aab9Aad9Aaf9Aag9Aah9Aai9Aaj9Aak9AYAAA==';
const buildFor = (deck, i) => /^Other /.test(deck) || i % 9 === 8 ? null : {
  deckCode: CODE, source: i % 3 ? 'hsguru-decks' : 'vicious_syndicate_decks', sourceLabel: i % 3 ? 'HSGuru' : 'Vicious Syndicate',
  sourceUrl: 'https://www.hsguru.com/deck/example', matchedArchetype: deck, matchMethod: i % 7 === 3 ? 'alias' : 'exact',
  updatedAt: '2026-10-08T06:12:00.000Z', winrate: 52.1, sampleGames: 1200, deckCards: [],
};
export const builds = {
  builds: decks.map((d, i) => ({ deck: d[0], build: buildFor(d[0], i) })),
  buildCoverage: { found: decks.filter((d, i) => buildFor(d[0], i)).length, total: decks.length },
};
