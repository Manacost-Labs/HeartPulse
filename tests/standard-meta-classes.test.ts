import assert from 'node:assert/strict';
import { inferStandardMetaClass, normalizeStandardMetaClass } from '../server/standardMetaClasses.js';

const cases = new Map([
  ['Evenlock', 'warlock'],
  ['XL Painlock', 'warlock'],
  ['Discolock', 'warlock'],
  ['Rafaamlock', 'warlock'],
  ['XL HL LC Quest Death Knight', 'deathknight'],
  ['Broxigar DH', 'demonhunter'],
  ['XL Highlander Hunter', 'hunter'],
  ['End of Turnadin', 'paladin'],
  ['Control Priest', 'priest'],
] as const);

for (const [archetype, expected] of cases) {
  assert.equal(inferStandardMetaClass(archetype), expected, archetype);
}

assert.equal(normalizeStandardMetaClass('DemonHunter'), 'demonhunter');
assert.equal(normalizeStandardMetaClass('Death Knight'), 'deathknight');
assert.equal(inferStandardMetaClass('Unknown experimental archetype'), null);

console.log('standard meta class inference tests passed');
