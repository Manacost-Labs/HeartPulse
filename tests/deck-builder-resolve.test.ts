import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import {
  extractDeckCardCounts,
  extractMainDeckCardCounts,
  extractSideboardParts,
  indexCardsRuByDbf,
  isValidDeckDbfId,
  jaccardScore,
  matchArchetypeByDeckCode,
  resolveDeckFromCode,
  translateArchetypeName,
  deckSizeLimitForCards,
} from '../server/deckBuilderResolve.js';
import { createDeckBuilderRouter } from '../server/deckBuilderRoutes.js';
import { decode, encode } from '@firestone-hs/deckstrings';

assert.equal(isValidDeckDbfId(120082), true);
assert.equal(isValidDeckDbfId(0), false);
assert.equal(isValidDeckDbfId(257467468263), false);

const userCode = 'AAECAea5AwfB/gbDgwf1mAeKqgeSqgeTqgeO2gcL4fgF3v8G/oMHtpch55OHkr8Hlb8HxN0Hxt0Hx90HteEHAAA=';
const official = 'AAECAea5AwbDgwf1mAeKqgeSqgeTqgeO2gcM4fgFwf4G3v8G/oMHtpcH550Hkr8Hlb8HxN0Hxt0Hx90HteEHAAA=';
const decoded = decode(userCode);
const cleaned = extractDeckCardCounts(decoded);
assert.ok(cleaned.some(card => card.dbfId === 120082));
assert.ok(cleaned.some(card => card.dbfId === 120083));
assert.equal(cleaned.some(card => card.dbfId === 0), false);

const cardsRu = {
  TIME_020: { name: 'Броксигар', mana: 2, rarity: 'legendary', dbf: 120074 },
  TIME_020t1: { name: 'Топор Кенария', mana: 2, rarity: '', dbf: 120083 },
  TIME_020t2: { name: 'Первый портал на Аргус', mana: 2, rarity: '', dbf: 120082 },
  GDB_142: { name: 'Душа Бездны', mana: 1, rarity: 'rare', dbf: 110921 },
  ETC_080: { name: 'Музыкальный менеджер E.T.C.', mana: 4, rarity: 'legendary', dbf: 90749 },
  TOY_330: { name: 'Зиллиакс Делюкс 3000', mana: 0, rarity: 'legendary', dbf: 102983 },
  REV_018: { name: 'Принц Ренатал', mana: 3, rarity: 'legendary', dbf: 79767 },
  CS2_029: { name: 'Огненный шар', mana: 4, rarity: 'free', dbf: 315 },
  EX1_116: { name: 'Чирлидер', mana: 2, rarity: 'common', dbf: 896 },
  NEW1_019: { name: 'Клинок', mana: 1, rarity: 'rare', dbf: 59621 },
};
const byDbf = indexCardsRuByDbf(cardsRu);
assert.equal(byDbf.get(120082)?.card_id, 'TIME_020t2');
assert.equal(byDbf.get(120083)?.card_id, 'TIME_020t1');

const resolved = resolveDeckFromCode({
  deckCode: userCode,
  catalogCards: [
    { card_id: 'TIME_020', dbf: 120074, name: { ru: 'Броксигар' }, mana_cost: 2, rarity: 'LEGENDARY', images: { crop: '/crop.webp', card: '/card.png' } },
  ],
  cardsRu,
  archetypeCandidates: [{ nameEn: 'Void Soul DH', deckCode: official }],
  archetypeTranslations: {
    'void soul dh': 'ДХ с Душой Бездны',
    'broxigar dh': 'Броксигар Охотник на демонов',
  },
});

assert.ok(resolved);
assert.equal(resolved?.format, 'standard');
assert.ok(resolved?.cards.some(card => card.dbfId === 120082 && card.name.includes('портал')));
assert.ok(resolved?.cards.some(card => card.dbfId === 120083 && card.name.includes('Топор')));
assert.ok((resolved?.archetype?.score || 0) >= 0.42);
assert.equal(resolved?.archetype?.archetypeLabel, 'ДХ с Душой Бездны');
assert.equal(translateArchetypeName('Broxigar DH', { 'broxigar dh': 'Броксигар Охотник на демонов' }), 'Броксигар Охотник на демонов');
assert.ok(jaccardScore(new Set([1, 2, 3]), new Set([2, 3, 4])) > 0.4);
assert.equal(matchArchetypeByDeckCode('nope', []), null);

const nearCode = 'AAECAea5AwSongaKqgeSqgeTqgcN4fgFzZ4G0J4G054G3v8GtpcH6LEHkr8Hlb8HxN0Hxt0Hx90HteEHAAA=';
const nearResolved = resolveDeckFromCode({
  deckCode: nearCode,
  catalogCards: [
    { card_id: 'TIME_020', dbf: 120074, name: { ru: 'Броксигар' }, mana_cost: 2, rarity: 'LEGENDARY' },
  ],
  cardsRu,
  archetypeCandidates: [{ nameEn: 'Void Soul DH', deckCode: official }],
  archetypeTranslations: { 'void soul dh': 'ДХ с Душой Бездны' },
});
assert.equal(nearResolved?.archetype?.archetypeLabel, 'ДХ с Душой Бездны');

const preferred = resolveDeckFromCode({
  deckCode: nearCode,
  catalogCards: [],
  cardsRu,
  archetypeCandidates: [],
  archetypeTranslations: { 'void soul dh': 'ДХ с Душой Бездны' },
  preferredArchetypeName: 'Void Soul DH',
});
assert.equal(preferred?.archetype?.archetypeLabel, 'ДХ с Душой Бездны');
assert.ok(preferred?.cards.every(card => card.image.includes('/tiles/')));

// Sideboards (ETC / Zilliax) stay out of the main 30/40 count.
const withSideboard = encode({
  format: 2,
  heroes: [930],
  cards: [
    [90749, 1],
    [102983, 1],
    [79767, 1],
    ...Array.from({ length: 37 }, (_, index) => [315 + (index % 3), 1] as [number, number]),
  ],
  sideboards: [
    { keyCardDbfId: 90749, cards: [[896, 1], [59621, 1]] },
    { keyCardDbfId: 102983, cards: [[315, 1]] },
  ],
});
const sideboardDecoded = decode(withSideboard);
assert.equal(extractSideboardParts(sideboardDecoded).length, 2);
assert.ok(extractMainDeckCardCounts(sideboardDecoded).some(card => card.dbfId === 90749));
assert.equal(extractMainDeckCardCounts(sideboardDecoded).some(card => card.dbfId === 896), false);

const sideboardResolved = resolveDeckFromCode({
  deckCode: withSideboard,
  catalogCards: [],
  cardsRu,
  archetypeCandidates: [],
  archetypeTranslations: {},
});
assert.ok(sideboardResolved);
assert.equal(sideboardResolved?.sideboards.length, 2);
assert.ok(sideboardResolved?.sideboards.some(item => item.keyCardDbfId === 90749 && item.cards.length === 2));
assert.ok(sideboardResolved?.sideboards.some(item => item.keyCardDbfId === 102983));
assert.equal(sideboardResolved?.deckSizeLimit, 40);
assert.equal(deckSizeLimitForCards([{ dbfId: 79767 }], 30), 40);

// ETC sideboard: key card resolves its RU name, and module cards keep the parent link + tile art.
const etcSideboard = sideboardResolved?.sideboards.find(item => item.keyCardDbfId === 90749);
assert.ok(etcSideboard, 'ETC sideboard present');
assert.equal(etcSideboard?.keyCard?.name, 'Музыкальный менеджер E.T.C.');
assert.equal(etcSideboard?.label, 'Музыкальный менеджер E.T.C.');
assert.ok(etcSideboard?.cards.every(card => card.sideboardKeyDbfId === 90749), 'ETC modules linked to key');
assert.ok(etcSideboard?.cards.every(card => card.image.includes('/tiles/')), 'ETC modules use tile art');
// Zilliax sideboard resolves too and stays a separate module.
const zilliaxSideboard = sideboardResolved?.sideboards.find(item => item.keyCardDbfId === 102983);
assert.equal(zilliaxSideboard?.keyCard?.name, 'Зиллиакс Делюкс 3000');
assert.equal(zilliaxSideboard?.cards.length, 1);
// Main deck count excludes every sideboard module card.
assert.equal(sideboardResolved?.cards.some(card => card.dbfId === 896), false);
assert.equal(sideboardResolved?.cards.some(card => card.dbfId === 59621), false);

const adminGuard: RequestHandler = (request, response, next) => {
  const identity = String(request.headers['x-test-user'] || '');
  if (!identity) return response.status(401).json({ error: 'Требуется вход' });
  if (identity !== 'admin') return response.status(403).json({ error: 'Доступ запрещён' });
  return next();
};
const app = express();
app.use(express.json());
app.use('/api', createDeckBuilderRouter({
  adminGuard,
  setPrivateNoStore: response => response.set('Cache-Control', 'private, no-store'),
  getDatabase: () => { throw new Error('not reached without a deck code'); },
  loadCatalogCards: async () => [],
  loadCardsRu: () => null,
  loadArchetypeTranslations: () => ({}),
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const address = server.address();
assert.ok(address && typeof address === 'object');
const baseUrl = `http://127.0.0.1:${address.port}/api`;
try {
  const anonymous = await fetch(`${baseUrl}/admin/deck-builder/resolve`, { method: 'POST' });
  assert.equal(anonymous.status, 401);
  const regularUser = await fetch(`${baseUrl}/admin/deck-builder/resolve`, {
    method: 'POST',
    headers: { 'X-Test-User': 'user' },
  });
  assert.equal(regularUser.status, 403);
  const administrator = await fetch(`${baseUrl}/admin/deck-builder/resolve`, {
    method: 'POST',
    headers: { 'X-Test-User': 'admin' },
  });
  assert.equal(administrator.status, 400);
  assert.equal(administrator.headers.get('cache-control'), 'private, no-store');
} finally {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

console.log('deck builder resolve tests passed');
