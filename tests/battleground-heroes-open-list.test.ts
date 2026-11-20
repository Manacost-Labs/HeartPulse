import assert from 'node:assert/strict';
import { openHeroSections } from '../apps/public-web/lib/openHeroSections.js';
import type { PublicBattlegroundHeroesRanking } from '../apps/public-web/lib/publicBattlegroundHeroesData.js';

// The open hero ranking of /heroes/ as the tier sections of the subscriber's view: every tier the projection allows
// (E and F included) keeps its heroes, in the projection's order, with the figures written as the subscriber's view writes them.

const hero = (dbfId: number, tier: string, avgPlacement: number) => ({
  dbfId, name: `Герой ${dbfId}`, image: null, tier, avgPlacement, top4Rate: null, pickRate: 12.5, games: null,
  heroPowerName: `Сила ${dbfId}`, heroPowerText: 'Текст', heroPowerImage: '/api/public-resource/hsjson/x.png', bestComposition: null, keyMinions: [],
});
const ranking = (mode: 'solo' | 'duos'): PublicBattlegroundHeroesRanking => ({
  mode, updatedAt: '2026-11-20T06:01:09.668Z', source: 'HSReplay',
  heroes: [hero(1, 'A', 4.01), hero(5, 'A', 4.3), hero(2, 'D', 4.9), hero(3, 'E', 5.4), hero(4, 'F', 6.1)],
});

for (const mode of ['solo', 'duos'] as const) {
  const sections = openHeroSections(ranking(mode));
  assert.deepEqual(sections.map(section => [section.tier, section.title, section.heroes.map(item => item.dbfId)]),
    [['A', 'A Тир', [1, 5]], ['D', 'D Тир', [2]], ['E', 'E Тир', [3]], ['F', 'F Тир', [4]]], `${mode}: no tier and no hero drops out`);
  assert.deepEqual(sections[0].heroes[0], {
    name: 'Герой 1', dbfId: 1, averagePlace: '4,01', popularity: '12.50%', image: sections[0].heroes[0].image, bestComposition: undefined,
    heroPower: { name: 'Сила 1', text: 'Текст', image: '/api/public-resource/hsjson/x.png' },
  });
}
assert.deepEqual(openHeroSections(null), []);
