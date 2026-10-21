import assert from 'node:assert/strict';
import test from 'node:test';
import { strategyDescription, strategyRows } from '../src/features/bgLibraryStrategyRows';

test('a build description drops the repeated tribe and name', () => {
  assert.equal(strategyDescription({ title: 'Pirates Bounty Apm', description: 'Pirates - Bounty APM Bounties generate gold and stats' }),
    'Bounties generate gold and stats');
  assert.equal(strategyDescription({ title: 'Naga Deep Blue', description: 'Duplicate Deep Blue Crooner\'s Spellcraft' }),
    'Duplicate Deep Blue Crooner\'s Spellcraft');
  assert.equal(strategyDescription({ title: 'Back To Back', description: 'Back To Back' }), null);
  assert.equal(strategyDescription({ title: 'Back To Back' }), null);
});

test('builds sort by tier and lead with the page minion, then core cards', () => {
  const card = (dbfId: number, role = 'ADDON') => ({ id: `BG_${dbfId}`, dbfId, ruName: `Существо ${dbfId}`, role });
  const rows = strategyRows([
    { key: 'hs', source: 'HSReplay', title: 'Meta', tier: '', cards: [card(1), { id: '#N/A', dbfId: null }, card(2, 'CORE'), card(7)] },
    { key: 'fs-b', source: 'Firestone', title: 'B build', tier: 'b', cards: Array.from({ length: 8 }, (_, index) => card(index + 10)) },
    { key: 'fs-s', source: 'Firestone', title: 'S build', tier: 'S', cards: [] },
  ], 7, id => `/art/${id}`);
  assert.deepEqual(rows.map(row => row.key), ['fs-s', 'fs-b', 'hs']);
  assert.equal(rows[1].label, 'Firestone · B');
  assert.equal(rows[2].label, 'HSReplay');
  assert.equal(rows[1].minions.length, 5);
  assert.deepEqual(rows[2].minions.map(minion => [minion.name, minion.current]), [['Существо 7', true], ['Существо 2', false], ['Существо 1', false]]);
  assert.equal(rows[2].minions[0].image, '/art/BG_7');
});
