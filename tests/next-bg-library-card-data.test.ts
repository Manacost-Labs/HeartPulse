import assert from 'node:assert/strict';
import { publicBattlegroundLibraryCard } from '../apps/public-web/lib/publicBattlegroundLibraryCardData';
import { battlegroundLibraryDetailApiPath } from '../apps/public-web/lib/battlegroundLibraryDetailKinds';

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

const archived = publicBattlegroundLibraryCard({ ...payload,
  canonicalPath: '/library/archive/minions/старый-механизм-98583/',
  card: { ...payload.card, dbfId: 98583, nameRu: 'Старый механизм' },
}, 'minions', '98583', 'archive');
assert.equal(archived.canonicalPath, '/library/archive/minions/старый-механизм-98583/');
assert.equal(battlegroundLibraryDetailApiPath('minions', 'archive', '98583'),
  '/api/bg/library/public/archive/minion/98583');

for (const [path, kind] of [
  ['anomalies', 'anomaly'], ['dark-gifts', 'dark_gift'], ['quests', 'quest'],
  ['rewards', 'reward'], ['darkmoon-prizes', 'darkmoon_prize'],
  ['trinkets', 'trinket'], ['timewarped', 'timewarped'],
] as const) {
  const extra = publicBattlegroundLibraryCard({
    canonicalPath: `/library/${path}/сила-в-бутылке-119142/`,
    card: { ...payload.card, dbfId: 119142, kind, nameRu: 'Сила в бутылке' },
  }, path, '119142');
  assert.equal(extra.canonicalPath, `/library/${path}/сила-в-бутылке-119142/`);
  assert.equal(battlegroundLibraryDetailApiPath(path, 'current', '119142'),
    `/api/bg/library/public/extra/current/${path}/119142`);
}
assert.equal(battlegroundLibraryDetailApiPath('anomalies', 'archive', '119142'),
  '/api/bg/library/public/extra/archive/anomalies/119142');
assert.equal(battlegroundLibraryDetailApiPath('dark-gifts', 'archive', '119142'), null);
assert.equal(battlegroundLibraryDetailApiPath('timewarped', 'archive', '119142'), null);
assert.equal(battlegroundLibraryDetailApiPath('unknown', 'current', '119142'), null);
assert.throws(() => publicBattlegroundLibraryCard({ ...payload,
  canonicalPath: '/library/archive/minions/баюбот-98582/',
}, 'minions', '98582'));
console.log('Next Battleground library card projection assertions passed');
