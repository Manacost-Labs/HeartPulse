import assert from 'node:assert/strict';
import test from 'node:test';
import {
  battlegroundStrategyMetaLine,
  battlegroundTierCardStats,
  battlegroundTierListMetaLine,
} from '../src/modules/battlegrounds/model/tierList';

test('minion cards lead with impact and keep the rest as supporting numbers', () => {
  const stats = battlegroundTierCardStats({ impact: 0.72, combatWinrate: '61.74%', popularity: '7.65%' }, 'minions');
  assert.deepEqual(stats.primary, { label: 'Влияние', value: '0,72' });
  assert.deepEqual(stats.secondary, [
    { label: 'Винрейт боёв', value: '61,7%' },
    { label: 'Выбор', value: '7,7%' },
  ]);
});

test('spell cards lead with average placement and skip missing numbers', () => {
  const stats = battlegroundTierCardStats({ avgPlacement: 2.1161, impact: 1.9099, totalPlayed: 96383 }, 'spells');
  assert.deepEqual(stats.primary, { label: 'Среднее место', value: '2,12' });
  assert.deepEqual(stats.secondary.map(entry => entry.label), ['Влияние', 'Игр']);
  assert.equal(stats.secondary[1].value, (96383).toLocaleString('ru-RU'));
  assert.deepEqual(battlegroundTierCardStats({ avgPlacement: null, impact: '' }, 'spells'), { primary: null, secondary: [] });
});

test('strategy meta line uses Russian decimals and drops absent HSReplay samples', () => {
  assert.equal(
    battlegroundStrategyMetaLine({ archetype: 'Свинобраз', avgPlacement: 3.11, games: 8261, difficulty: 'Средняя' }),
    `Свинобраз · ср. место 3,11 · ${(8261).toLocaleString('ru-RU')} игр · средняя`,
  );
  assert.equal(battlegroundStrategyMetaLine({ archetype: 'Механизмы', avgPlacement: null, games: null, difficulty: 'Лёгкая' }),
    'Механизмы · лёгкая');
});

test('list meta line shows the filtered share only when a filter hides entries', () => {
  assert.match(battlegroundTierListMetaLine({ shown: 255, total: 255, source: 'hsreplay', fetchedAt: '2026-10-26T06:01:14Z' }),
    /^255 · HSReplay · 26\.10/);
  assert.equal(battlegroundTierListMetaLine({ shown: 130, total: 251, source: 'Firestone' }), '130 из 251 · Firestone');
  assert.equal(battlegroundTierListMetaLine({ shown: 0, total: 0 }), '0');
});
