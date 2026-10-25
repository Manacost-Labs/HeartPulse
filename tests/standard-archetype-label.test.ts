import assert from 'node:assert/strict';
import {
  archetypeLabel,
  disambiguateArchetypeLabels,
  findDuplicateArchetypeLabels,
  matchArchetypeTranslation,
} from '../server/modules/constructedArchetypes/public.js';

const translations = {
  piglock: 'Чернокнижник с Расхождением',
  'pirate warrior': 'Пират Воин',
  'void dh': 'Охотник на демонов Бездны',
  'harold rogue': 'Разбойник на возвещении',
  'zee shaman': 'Зи Шаман',
};

assert.equal(archetypeLabel('Piglock', translations), 'Чернокнижник с Расхождением');
assert.equal(archetypeLabel('  Pirate Warrior ', translations), 'Пират Воин');

// HSGuru's variants of a translated archetype keep the words that set them apart,
// so two archetypes of one slice never share a label: the automatic label names
// every word in Russian when it can.
assert.equal(archetypeLabel('Harold Piglock', translations), 'Чернокнижник на возвещении с Расхождением');
assert.equal(archetypeLabel('Dragon Pirate Warrior', translations), 'Воин на драконах и пиратах');
assert.equal(archetypeLabel('Sneaky Harold Rogue', translations), 'Разбойник на скрытности и возвещении');
assert.equal(archetypeLabel('Harold Void DH', translations), 'Охотник на демонов Бездны на возвещении');
// Otherwise the contained translation lends its label and the rest stays in brackets.
assert.equal(archetypeLabel('XL Zee Shaman Deluxe', translations), 'Зи Шаман (XL Deluxe)');
assert.equal(archetypeLabel('Blorp Pirate Warrior', translations), 'Пират Воин (Blorp)');

// The longest contained name wins; a name without any gets the automatic label,
// and one the automatic label cannot read keeps its English form.
assert.equal(
  archetypeLabel('Harold Pirate Warrior', { ...translations, 'harold pirate warrior': 'Пират Воин на возвещении' }),
  'Пират Воин на возвещении',
);
assert.equal(archetypeLabel('Quest Priest', translations), 'Квест Жрец');
assert.equal(archetypeLabel('Tyrande Priest', translations), 'Тиранда Жрец');
assert.equal(archetypeLabel('Mystery Blob', translations), 'Mystery Blob');

const labels = ['Piglock', 'Harold Piglock', 'Pirate Warrior', 'Dragon Pirate Warrior', 'Void DH', 'Harold Void DH']
  .map(name => archetypeLabel(name, translations));
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

// Keys of any casing or spacing match, and the matcher reports what it covered.
assert.equal(archetypeLabel('  Harold   PIGLOCK ', { ' harold piglock ': 'Чернокнижник с Расхождением на возвещении' }), 'Чернокнижник с Расхождением на возвещении');
assert.deepEqual(matchArchetypeTranslation('Dragon Pirate Warrior', translations), { key: 'pirate warrior', label: 'Пират Воин', qualifier: 'Dragon' });
assert.equal(matchArchetypeTranslation('Quest Priest', translations), null);
assert.equal(matchArchetypeTranslation('   ', translations), null);

// Summoner Mage / Manastorm Mage: the admin table gave both one Russian name.
// The list keeps the shorter English name bare and qualifies the other, and the
// admin lists the pair so a translator can tell them apart.
{
  const adminRows = [
    { nameEn: 'Manastorm Mage', nameRu: 'Манашторм Маг' },
    { nameEn: 'Summoner Mage', nameRu: 'манашторм маг' },
    { nameEn: 'Void DH', nameRu: 'Охотник на демонов Бездны' },
  ];
  assert.deepEqual(findDuplicateArchetypeLabels(adminRows), [{ nameRu: 'Манашторм Маг', namesEn: ['Manastorm Mage', 'Summoner Mage'] }]);
  const map = Object.fromEntries(adminRows.map(row => [row.nameEn.toLowerCase(), row.nameRu]));
  const labelled = disambiguateArchetypeLabels(['Manastorm Mage', 'Summoner Mage'].map(archetype => ({
    archetype,
    archetypeLabel: archetypeLabel(archetype, { ...map, 'summoner mage': 'Манашторм Маг' }),
  })));
  assert.deepEqual(labelled.map(row => row.archetypeLabel), ['Манашторм Маг (Manastorm Mage)', 'Манашторм Маг']);
}
