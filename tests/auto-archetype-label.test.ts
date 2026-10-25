import assert from 'node:assert/strict';
import test from 'node:test';
import { autoArchetypeLabel, layerArchetypeTranslations } from '../server/modules/constructedArchetypes/public.js';

const label = (name: string) => autoArchetypeLabel(name)?.label;

test('a card or mechanic stands before the class, in its ruRU name', () => {
  assert.equal(label('Tyrande Priest'), 'Тиранда Жрец');
  assert.equal(label('Quest Warlock'), 'Квест Чернокнижник');
  assert.equal(label("N'Zoth Handbuff DK"), "Н'зот Хэндбафф Рыцарь смерти");
  // Mug'Zee is «Граб'Зи»; HSGuru calls one archetype by both halves of its name.
  assert.equal(label('Mug Shaman'), "Граб'Зи Шаман");
  assert.equal(label("Zee C'Thun Shaman"), "Граб'Зи К'тун Шаман");
});

test('tribes and keywords follow the class; genitives come first, «на» phrases join', () => {
  assert.equal(label('Dragon Warrior'), 'Воин на драконах');
  assert.equal(label('Dragon Pirate Warrior'), 'Воин на драконах и пиратах');
  assert.equal(label('Harold Void DH'), 'Охотник на демонов Бездны на возвещении');
  assert.equal(label('Demon DH'), 'Демонический Охотник на демонов');
  assert.equal(label('Frost Death Knight'), 'Рыцарь смерти Льда');
});

test('fused class names and HSGuru tags are read', () => {
  assert.equal(label('Shredslock'), 'Чернокнижник на обрывках');
  assert.equal(label('STD Zoolock'), 'Зоолок (из Стандарта)');
  assert.equal(label('End of Turnadin'), 'Паладин на конце хода');
  assert.equal(label('XL HL LC Quest Warrior'), 'Ренатал Хайландер Квест Воин (Затерянный город)');
});

test('unknown words stay in English and are reported; a name without a class is not guessed', () => {
  assert.deepEqual(autoArchetypeLabel('Basher Warrior'), { label: 'Basher Воин', unknown: ['Basher'] });
  assert.equal(autoArchetypeLabel('Splendiferous Whizbang'), null);
  assert.equal(autoArchetypeLabel('   '), null);
});

test('built-in labels win over BlizzCore rows, manual rows win over both', () => {
  const map = layerArchetypeTranslations([
    { nameEn: 'Zee Shaman', nameRu: 'Зи Шаман', source: 'blizzcore' },
    { nameEn: 'Dragon Warrior', nameRu: 'Дракон Воин', source: 'blizzcore' },
    { nameEn: 'Zoolock', nameRu: 'Зоолок', source: 'blizzcore' },
    { nameEn: 'Dragon Warrior', nameRu: 'Драконий Воин', source: 'manual' },
  ]);
  assert.equal(map['zee shaman'], "Граб'Зи Шаман");
  assert.equal(map['dragon warrior'], 'Драконий Воин');
  assert.equal(map.zoolock, 'Зоолок');
});

test('an unknown stem of a fused name keeps its original spelling', () => {
  assert.deepEqual(autoArchetypeLabel('J-Lock'), { label: 'J Чернокнижник', unknown: ['J'] });
});
