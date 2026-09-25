import assert from 'node:assert/strict';
import { publicBattlegroundLibraryCard } from '../apps/public-web/lib/publicBattlegroundLibraryCardData';

const payload = {
  canonicalPath: '/library/minions/баюбот-98582/',
  card: {
    dbfId: 98582, kind: 'minion', nameRu: 'Баюбот', typeName: 'Существо',
    textRu: 'Магнетизм', images: { card: 'https://api.kolodahearthstone.com/uploads/cards/BG26_146.png' },
    winrate: 'PRIVATE_CARD_WINRATE',
  },
};
const card = publicBattlegroundLibraryCard(payload, 'minions', '98582');
assert.equal(card.name, 'Баюбот');
assert.equal(card.image, 'https://hearthpulse.net/api/public-resource/db/uploads/cards/BG26_146.png');
assert.equal(JSON.stringify(card).includes('PRIVATE_CARD_WINRATE'), false);
assert.equal(card.canonicalPath, '/library/minions/баюбот-98582/');
assert.throws(() => publicBattlegroundLibraryCard(payload, 'spells', '98582'));
assert.throws(() => publicBattlegroundLibraryCard(payload, 'minions', '98583'));
assert.throws(() => publicBattlegroundLibraryCard({ ...payload, canonicalPath: '//evil.test/' }, 'minions', '98582'));
const unsafe = publicBattlegroundLibraryCard({ ...payload, card: {
  ...payload.card, images: { card: 'javascript:alert(1)' },
} }, 'minions', '98582');
assert.equal(unsafe.image, 'https://hearthpulse.net/assets/og-preview.png');
console.log('Next Battleground library card projection assertions passed');
