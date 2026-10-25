import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  archetypeFallbackTranslations,
  archetypeLabel,
  disambiguateArchetypeLabels,
  findDuplicateArchetypeLabels,
} from '../server/modules/constructedArchetypes/public.js';
import { ARCHETYPE_FALLBACK_LABELS } from '../server/modules/constructedArchetypes/fallbackTranslations.js';

// Snapshot of hearthpulse.net on 2026-10-21: every Standard and Wild archetype
// of the public catalog teaser and the exact admin translations of that day.
// Labels are production's, except names no translation covered exactly: since
// 2026-10-25 those get the automatic Russian label (autoArchetypeLabel)
// instead of the English name or an English word in brackets.
const golden = JSON.parse(readFileSync(new URL('./fixtures/archetype-labels-golden-20261021.json', import.meta.url), 'utf8')) as {
  translations: Record<string, string>;
  cases: Array<{ name: string; label: string }>;
};

assert.ok(golden.cases.length >= 100, 'the golden set covers at least 100 real archetype names');
for (const { name, label } of golden.cases) {
  assert.equal(archetypeLabel(name, golden.translations), label, name);
}

// Within one list the labels are distinct even where the admin table itself
// gives different archetypes one Russian name (Quest Mage / JtU Quest Mage,
// Manastorm Mage / Summoner Mage, Void DH / Void Soul DH, two XL HL lists).
const labelled = disambiguateArchetypeLabels(golden.cases.map(({ name, label }) => ({ archetype: name, archetypeLabel: label })));
assert.equal(new Set(labelled.map(item => item.archetypeLabel)).size, golden.cases.length);
const byName = new Map(labelled.map(item => [item.archetype, item.archetypeLabel]));
assert.equal(byName.get('Void DH'), 'Охотник на демонов Бездны');
assert.equal(byName.get('Void Soul DH'), 'Охотник на демонов Бездны (Void Soul DH)');
assert.equal(byName.get('Piglock'), 'Чернокнижник с Расхождением');
assert.equal(byName.get('Harold Piglock'), 'Чернокнижник на возвещении с Расхождением');
assert.equal(byName.get('Pirate Warrior'), 'Пират Воин');
assert.equal(byName.get('Dragon Pirate Warrior'), 'Воин на драконах и пиратах');
assert.equal(byName.get('Zee C\'Thun Shaman'), 'Граб\'Зи К\'тун Шаман');
assert.equal(byName.get('N\'Zoth Priest'), 'Н\'зот Жрец');
assert.equal(byName.get('Summoner Mage'), 'Манашторм Маг');
assert.equal(byName.get('Manastorm Mage'), 'Манашторм Маг (Manastorm Mage)');

// The snapshot's duplicates are exactly what the admin list reports for fixing.
const snapshotRows = golden.cases
  .filter(({ name }) => golden.translations[name.toLowerCase()])
  .map(({ name, label }) => ({ nameEn: name, nameRu: label }));
assert.deepEqual(findDuplicateArchetypeLabels(snapshotRows).map(group => group.namesEn), [
  ['JtU Quest Mage', 'Quest Mage'],
  ['Manastorm Mage', 'Summoner Mage'],
  ['Void DH', 'Void Soul DH'],
  ['XL Highlander Hunter', 'XL HL Leoroxx Hunter'],
  ['XL HL Thief Priest', 'XL HL Thief Rogue'],
]);

// The built-in dictionary never gives two different archetypes one label;
// only spelling aliases of one archetype share it.
const aliasGroups = new Set([
  'Harold DH|Herald DH',
  'Harold DK|Herald DK|Herald DeathKnight',
  'Harold Rogue|Herald Rogue',
  'Harold Shaman|Herald Shaman',
  'Harold Warrior|Herald Warrior',
  'Harold Egglock|Herald Egg Warlock',
  'Rafaam Warlock|Rafaamlock',
  'Unholy DK|Unholy DeathKnight',
  'Mug Shaman|Zee Shaman',
  'Discard Warlock|discolock',
  'Pain Warlock|Painlock',
]);
const fallbackRows = Object.entries(ARCHETYPE_FALLBACK_LABELS).map(([nameEn, nameRu]) => ({ nameEn, nameRu }));
for (const group of findDuplicateArchetypeLabels(fallbackRows)) {
  assert.ok(aliasGroups.has([...group.namesEn].sort().join('|')), `different archetypes share «${group.nameRu}»: ${group.namesEn.join(', ')}`);
}
assert.equal(Object.keys(archetypeFallbackTranslations()).length, Object.keys(ARCHETYPE_FALLBACK_LABELS).length);
