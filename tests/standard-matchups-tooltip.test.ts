import assert from 'node:assert/strict';
import { activeMatrixMatchupAt } from '../src/features/standardMatchupsTooltip';

Object.defineProperty(globalThis, 'window', {
  configurable: true, value: { innerWidth: 1200, innerHeight: 900 },
});
const row = { archetype: 'Tempo Mage' };
const cell = { opponent: 'Control Warrior', winrate: 51.4 };
const anchorAt = (top: number, bottom: number) => ({
  getBoundingClientRect: () => ({ left: 400, width: 100, top, bottom }),
}) as HTMLButtonElement;

const below = activeMatrixMatchupAt(anchorAt(100, 130), row, cell, 'Маг', 'Воин');
assert.equal(below.placement, 'below');
assert.equal(below.left, 270);
assert.equal(below.top, 140);
assert.equal(below.cell, cell);

const above = activeMatrixMatchupAt(anchorAt(840, 870), row, cell, 'Маг', 'Воин');
assert.equal(above.placement, 'above');
assert.equal(above.top, 830);
console.log('Standard matchup tooltip placement contract passed');
