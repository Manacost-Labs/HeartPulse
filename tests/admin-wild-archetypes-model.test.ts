import assert from 'node:assert/strict';
import { readWildArchetypes, readWildDecks } from '../src/modules/adminWorkspace/wildArchetypesModel';

const archetypes = readWildArchetypes({ items: [
  { nameEn: 'Wild Mage', nameRu: 'Маг Вольного формата', classLabel: 'Маг', wild: true,
    stats: { winRate: 54.7, games: 1200 } },
  { nameEn: '', nameRu: 'Invalid', wild: true },
  { nameEn: 'Standard Mage', wild: false },
] });
assert.deepEqual(archetypes, [{ nameEn: 'Wild Mage', nameRu: 'Маг Вольного формата',
  classLabel: 'Маг', winRate: 54.7, games: 1200 }]);
assert.throws(() => readWildArchetypes({ items: null }), /каталог/i);

const deckCode = 'AAECAf0EBpGxA8W4A5KBA6iKBLqRBM2eBgzAAbAClgX0xgX7yQXz8QWQgwaGgwY=';
const decks = readWildDecks({ decks: [
  { title: 'Wild Mage', deck_code: deckCode, win_rate: 58.2, games: 423 },
  { title: 'Unsafe', deck_code: 'javascript:alert(1)' },
  { title: 'No code', deck_code: '' },
] }, 'Маг Вольного формата');
assert.deepEqual(decks, [{ title: 'Wild Mage', deckCode, winRate: 58.2, games: 423 }]);
assert.throws(() => readWildDecks({ decks: {} }, 'Маг'), /колод/i);
console.log('admin wild archetypes model tests passed');
