import assert from 'node:assert/strict';
import { cardRulesText, renderCardPlurals, restoreCardPlurals } from '../shared/hearthstoneCardText.js';
import { createOriginalCardTexts, renderPayloadCardPlurals } from '../server/cardPluralTexts.js';

const turns = (count: number) => renderCardPlurals(`Через ${count} |4(ход,хода,ходов)`);
assert.equal(turns(1), 'Через 1 ход');
assert.equal(turns(2), 'Через 2 хода');
assert.equal(turns(5), 'Через 5 ходов');
assert.equal(turns(11), 'Через 11 ходов', '11–14 take the many form');
assert.equal(turns(12), 'Через 12 ходов');
assert.equal(turns(21), 'Через 21 ход');
assert.equal(turns(22), 'Через 22 хода');
assert.equal(renderCardPlurals('In 1 |4(turn,turns)'), 'In 1 turn', 'two forms are one/other');
assert.equal(renderCardPlurals('In 3 |4(turn,turns)'), 'In 3 turns');

// The number may be separated from the marker by tags, spaces, [x] or words.
assert.equal(
  renderCardPlurals('применяет 2 <b>|4(кровавый самоцвет,кровавых самоцвета,кровавых самоцветов)</b> к остальным'),
  'применяет 2 <b>кровавых самоцвета</b> к остальным',
);
assert.equal(
  renderCardPlurals('[x]1 |4(ваше случайное существо,ваших случайных существа,ваших случайных существ)\nполучают +1/+1.'),
  '[x]1 ваше случайное существо\nполучают +1/+1.',
);
assert.equal(renderCardPlurals('вы получаете (1) |4(золотой,золотых,золотых).'), 'вы получаете (1) золотой.');
assert.equal(
  renderCardPlurals('2 ваших\n|4(дракон дважды получает,дракона дважды получают,драконов дважды получают)'),
  '2 ваших\nдракона дважды получают',
);
assert.equal(
  renderCardPlurals('в 3 [x] |4(следующее <b>обновление</b>,следующих <b>обновления</b>,следующих <b>обновлений</b>).'),
  'в 3 [x] следующих <b>обновления</b>.',
  'forms keep their own markup',
);
assert.equal(renderCardPlurals('+1/+1 и {0} |4(золотой,золотых,золотых)'), '+1/+1 и {0} золотых',
  'a game placeholder takes the many form, never an earlier unrelated number');
assert.equal(renderCardPlurals('Копии 2 карт.@ <i>(@ |4(карта,карты,карт))</i>'), 'Копии 2 карт.@ <i>(@ карт)</i>',
  'so does the `@` counter');
assert.equal(renderCardPlurals('Еще 2 |4(ход,хода,ходов). Еще 5 |4(раз,раза,раз).'), 'Еще 2 хода. Еще 5 раз.');
assert.equal(renderCardPlurals('Стоят на (2) меньше.'), 'Стоят на (2) меньше.', 'text without markup is untouched');

// The catalog sometimes strips the number and the marker; HearthstoneJSON keeps them.
const ritual = 'Вы берете 2 карты через 2 |4(ход,хода,ходов). Они стоят на (2) меньше.';
assert.equal(
  restoreCardPlurals('Вы берете 2 карты через (ход,хода,ходов). Они стоят на (2) меньше.', ritual),
  'Вы берете 2 карты через 2 хода. Они стоят на (2) меньше.',
);
assert.equal(
  restoreCardPlurals("Через (ход,хода,ходов) вы призываете двух к'тракси 3/5.", "Через 2 |4(ход,хода,ходов) вы призываете двух к'тракси 3/5."),
  "Через 2 хода вы призываете двух к'тракси 3/5.",
);
assert.equal(
  restoreCardPlurals('через 2 (ход, хода, ходов)', 'через 2 |4(ход,хода,ходов)'),
  'через 2 хода', 'a number the catalog kept is not repeated, and spacing inside the forms does not matter',
);
assert.equal(
  restoreCardPlurals('Еще (ход,хода,ходов), потом еще (ход,хода,ходов).', 'Еще 1 |4(ход,хода,ходов), потом еще 3 |4(ход,хода,ходов).'),
  'Еще 1 ход, потом еще 3 хода.', 'repeated groups take their own numbers in order',
);
assert.equal(restoreCardPlurals('через (ход,хода,ходов)', null), 'через (ход,хода,ходов)', 'without the original nothing is guessed');
assert.equal(restoreCardPlurals('Стоят на (2) меньше.', ritual), 'Стоят на (2) меньше.');

assert.equal(cardRulesText('Еще 2 |4(ход,хода,ходов). Через (раз,раза,раз).', 'Еще 2 |4(ход,хода,ходов). Через 4 |4(раз,раза,раз).'),
  'Еще 2 хода. Через 4 раза.');
// Catalog payloads: every card text is rendered in place, stripped counts come from the originals.
const originals = new Map([['BE_005', ritual]]);
const payload = {
  data: [
    { card_id: 'BE_005', text: { ru: 'Вы берете 2 карты через (ход,хода,ходов).', en: 'In 2 |4(turn,turns), draw 2 cards.' } },
    { cardId: 'BG_1', text_ru: 'Еще 3 |4(ход,хода,ходов).', stats: { text: 'не карта' } },
  ],
  meta: { total: 2 },
};
assert.equal(renderPayloadCardPlurals(payload, originals), payload, 'the payload is changed in place');
assert.equal(payload.data[0].text.ru, 'Вы берете 2 карты через 2 хода.');
assert.equal(payload.data[0].text.en, 'In 2 turns, draw 2 cards.');
assert.equal(payload.data[1].text_ru, 'Еще 3 хода.');
assert.deepEqual(payload.data[1].stats, { text: 'не карта' }, 'plain text fields that are not card texts stay as they are');

// The original texts: only counted ones are kept, and a failed download never fails the request.
let clock = 0;
let downloads = 0;
let fail = false;
const texts = createOriginalCardTexts({
  url: 'https://example.test/cards.json', now: () => clock, ttlMs: 1_000, retryMs: 100,
  fetchJson: async () => {
    downloads += 1;
    if (fail) throw new Error('offline');
    return [{ id: 'BE_005', text: ritual }, { id: 'CS2_029', text: 'Наносит 6 ед. урона.' }, { id: 7, text: '2 |4(a,b,c)' }];
  },
});
assert.equal(texts.current().size, 0, 'nothing is in memory before the first download');
assert.deepEqual([...(await texts.load()).keys()], ['BE_005']);
await texts.load();
assert.equal(downloads, 1, 'a fresh map is reused');
clock = 2_000;
fail = true;
assert.deepEqual([...(await texts.load()).keys()], ['BE_005'], 'a failed refresh keeps the previous texts');
await texts.load();
assert.equal(downloads, 2, 'and waits for the retry interval');
const slow = createOriginalCardTexts({ url: 'x', fetchJson: () => new Promise(() => {}) });
assert.equal((await slow.within(5)).size, 0, 'a request does not wait past its budget');

console.log('hearthstone card plurals: ok');
