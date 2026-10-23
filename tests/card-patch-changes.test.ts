import assert from 'node:assert/strict';
import { cardPatchChange, cardPatchEntries } from '../src/features/cardPatchChanges.js';

assert.deepEqual(cardPatchChange('Added.'), { text: 'Карта добавлена в игру', kind: 'added', minor: false });
assert.deepEqual(cardPatchChange('Now costs 4 (Down from 5).'), { text: 'Стоимость: 5 → 4', kind: 'buff', minor: false });
assert.deepEqual(cardPatchChange('Now costs 6 (Up from 5).'), { text: 'Стоимость: 5 → 6', kind: 'nerf', minor: false });
assert.deepEqual(cardPatchChange('Now has 3 attack (Up from 2).'), { text: 'Атака: 2 → 3', kind: 'buff', minor: false });
assert.deepEqual(cardPatchChange('Now has 2 Health (Down from 4).'), { text: 'Здоровье: 4 → 2', kind: 'nerf', minor: false });
assert.equal(cardPatchChange('2014-12-04: Moved from the Classic set to the Legacy set.').text,
  'Перенесена из набора «Классический» в «Наследие»', 'a leading date of an older patch is dropped');
assert.equal(cardPatchChange('Now reads: " Spell Damage +1 " (previously: " Spell Power +1 " )').text,
  'Новый текст: «Spell Damage +1» (было: «Spell Power +1»)');
assert.equal(cardPatchChange('Minion type is now Undead (previously: no minion type).').text, 'Тип существа: Нежить');
assert.equal(cardPatchChange('Flavor text now reads: " Voodoo is art. " (previously: " Old. ").').minor, true,
  'flavor text is a minor note');
assert.equal(cardPatchChange('Temporarily banned from Duels deck-building and card buckets.').minor, true);
assert.equal(cardPatchChange('Something new happened.').text, 'Something new happened.', 'unknown lines keep the wiki text');

const entries = cardPatchEntries([{ heading: 'Card changes', entries: [
  { date: '2024-01-01', items: ['Added.'], patch: 'Patch 28.6.0.1', patch_url: 'https://hearthstone.wiki.gg/wiki/Patch_28.6.0.1' },
  { date: '2025-03-18', items: ['Now costs 4 (Down from 5).', 'Flavor text now reads: " A " (previously: " B ").'],
    patch: 'Patch 32.0.0.217964', manacost_url: 'https://hs-manacost.ru/obnovlenie-32-0/', manacost_title: 'Обновление 32.0',
    manacost_published_at: '2025-03-18T21:00:46' },
] }]);
assert.deepEqual(entries.map(entry => entry.version), ['Патч 32.0', 'Патч 28.6'], 'newest patch first, short version');
assert.equal(entries[0].articleUrl, 'https://hs-manacost.ru/obnovlenie-32-0/');
assert.deepEqual(entries[0].changes.map(change => change.minor), [false, true]);
assert.deepEqual(cardPatchEntries(null), []);

console.log('card patch change contracts passed');
