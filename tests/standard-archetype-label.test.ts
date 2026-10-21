import assert from 'node:assert/strict';
import { disambiguateArchetypeLabels, translateStandardArchetype } from '../server/modules/constructedArchetypes/public.js';

const translations = {
  piglock: 'Чернокнижник с Расхождением',
  'pirate warrior': 'Пират Воин',
  'void dh': 'Охотник на демонов Бездны',
  'harold rogue': 'Разбойник на возвещении',
  'zee shaman': 'Зи Шаман',
};

assert.equal(translateStandardArchetype('Piglock', translations), 'Чернокнижник с Расхождением');
assert.equal(translateStandardArchetype('  Pirate Warrior ', translations), 'Пират Воин');

// HSGuru's variants of a translated archetype keep the words that set them apart,
// so two archetypes of one slice never share a label.
assert.equal(translateStandardArchetype('Harold Piglock', translations), 'Чернокнижник с Расхождением (Harold)');
assert.equal(translateStandardArchetype('Dragon Pirate Warrior', translations), 'Пират Воин (Dragon)');
assert.equal(translateStandardArchetype('Sneaky Harold Rogue', translations), 'Разбойник на возвещении (Sneaky)');
assert.equal(translateStandardArchetype('XL Zee Shaman Deluxe', translations), 'Зи Шаман (XL Deluxe)');
assert.equal(translateStandardArchetype('Harold Void DH', translations), 'Охотник на демонов Бездны (Harold)');

// The longest contained name wins, and a name without any keeps its English form.
assert.equal(
  translateStandardArchetype('Harold Pirate Warrior', { ...translations, 'harold pirate warrior': 'Пират Воин на возвещении' }),
  'Пират Воин на возвещении',
);
assert.equal(translateStandardArchetype('Quest Priest', translations), 'Quest Priest');

const labels = ['Piglock', 'Harold Piglock', 'Pirate Warrior', 'Dragon Pirate Warrior', 'Void DH', 'Harold Void DH']
  .map(name => translateStandardArchetype(name, translations));
assert.equal(new Set(labels).size, labels.length);

// Two names translated alike in the source data still get distinct labels in one list.
{
  const rows = [
    { archetype: 'Void Soul DH', archetypeLabel: 'Охотник на демонов Бездны', winrate: 55.9 },
    { archetype: 'Void DH', archetypeLabel: 'Охотник на демонов Бездны', winrate: 61.4 },
    { archetype: 'Quest Priest', archetypeLabel: 'Квест Жрец', winrate: 60 },
  ];
  const labelled = disambiguateArchetypeLabels(rows);
  assert.deepEqual(labelled.map(row => row.archetypeLabel), ['Охотник на демонов Бездны (Void Soul DH)', 'Охотник на демонов Бездны', 'Квест Жрец']);
  assert.equal(labelled[2], rows[2]);
  assert.equal(labelled[0].winrate, 55.9);
}
