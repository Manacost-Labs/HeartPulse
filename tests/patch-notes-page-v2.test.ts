import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PatchNotesView } from '../src/features/PatchNotesView.js';
import { lineParts } from '../src/features/patchNotes/PatchGeneralChanges.js';
import { changePlates } from '../src/features/patchNotes/patchChangePlates.js';

const ARCHIVE = 'https://api.kolodahearthstone.com/uploads/card-history-media/';
const entry = (over: Record<string, unknown>) => ({
  id: 'x', name: 'Карта', sourceName: null, mode: 'constructed', cardId: null, cardClass: null, cardType: null, renderUrl: null, artwork: null,
  format: 'standard', archetypes: [], history: [], subtitle: null, note: null, changes: [], beforeRenderUrl: null, afterRenderUrl: null, ...over,
});
const page = (entries: object[], generalChanges: object[] = []) => renderToStaticMarkup(createElement(PatchNotesView, { patches: [{
  version: '37.0.2', build: '37.0.2.1', title: 'Обновление 37.0.2: балансные изменения', publishedAt: '2026-11-03T15:55:00+00:00',
  sourceUrl: 'https://hs-manacost.ru/37-0-2/', officialUrl: 'https://playhearthstone.com/en-us/blog/1', changeCount: entries.length, summary: null,
  entries, missingBefore: 0, pictureSections: [{ mode: 'constructed', title: 'Изменения карт' }], generalChanges, meta: null,
}] as never }));

const knight = entry({
  id: 'knight', name: 'Рыцарь-гибрид', cardId: 'BE_285', cardType: 'minion', changes: [{ label: 'Здоровье', before: 3, after: 4, better: 'higher' }],
  beforeRenderUrl: `${ARCHIVE}aa.png`, afterRenderUrl: `${ARCHIVE}bb.png`,
});
const wrath = entry({
  id: 'wrath', name: 'Гнев К’Туна', subtitle: 'Способность К’Туна', cardId: 'BE_013t1', cardType: 'spell', format: null,
  renderUrl: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/BE_013t1.png',
  changes: [{ label: 'Текст', before: 'Наносит 7 ед. урона, случайно распределяемого между противниками.', after: 'Наносит 6 ед. урона, случайно распределяемого между противниками.' }],
});
const unknown = entry({
  id: 'unknown', name: 'Карта без картинки', cardId: null, format: null,
  changes: [{ label: 'Текст', before: 'Уничтожает существо, а затем возрождает его.', after: 'Уничтожает нелегендарное существо, а затем возрождает его.' }],
});

test('a change with a picture shows no "Было / Стало" text; a card with none shows its text once, the changed words marked', () => {
  const html = page([knight, wrath, unknown]);
  const cards = html.split('<article').slice(1);
  assert.equal(cards.length, 3);
  const [pair, single, line] = cards;
  assert.match(pair, /data-variant="pair"/);
  assert.match(pair, /Здоровье<\/span><span class="hp-plate__values"><s><span class="sr-only">было <\/span>3<\/s>[\s\S]*<b><span class="sr-only">стало <\/span>4<\/b>/);
  assert.match(single, /data-variant="single"[\s\S]*Сейчас/);
  assert.match(single, /src="\/api\/public-resource\/hsjson\/v1\/render\/latest\/ruRU\/512x\/BE_013t1\.png\?[^"]*width=480/, 'a card the dictionary lacks shows its catalog render');
  assert.match(single, /Способность К’Туна/);
  assert.ok(!pair.includes('hp-plate__text'), 'a pair shows the text on its pictures');
  assert.match(single, /<p class="hp-pc__diff">[^]*<del><span class="sr-only">было <\/span>7<\/del>[^]*<ins><span class="sr-only">стало <\/span>6<\/ins>/, 'a single picture adds the changed words only');
  assert.ok(!/Было:|Стало:/.test(pair + single));
  assert.match(single, /<span class="hp-plate__label">Текст<\/span>/, 'the plate only says the text changed');
  assert.match(line, /data-variant="line"/);
  assert.match(line, /<span>Уничтожает <\/span><ins><span class="sr-only">стало <\/span>нелегендарное <\/ins><span>существо, а затем возрождает его\.<\/span>/);
  assert.equal((line.match(/Уничтожает/g) ?? []).length, 1, 'one paragraph, not an old and a new one');
});

test('the patch header is the version, the date and the sources; no count, no lead, no picture-only line', () => {
  const html = page([knight]);
  const header = html.slice(html.indexOf('hp-release__head'), html.indexOf('</header>'));
  assert.match(header, /Патч 37\.0\.2/);
  assert.match(header, /3 ноября 2026/);
  assert.match(header, /hs-manacost\.ru/);
  assert.match(header, /Blizzard/);
  assert.ok(!/изменени/i.test(header), 'no "N изменений"');
  assert.ok(!/балансные/.test(html), 'the article headline is not repeated');
  assert.ok(!html.includes('в статье только картинками'));
  assert.ok(!html.includes('hp-release__pictures'));
});

test('a mode is a heading on a strip of its own art with its emblem; Battlegrounds uses the Battlegrounds strip', () => {
  const html = page([knight, entry({ id: 'bg', name: 'Страж', mode: 'battlegrounds', format: null, cardId: 'BG36_362', cardType: 'minion', changes: [{ label: 'Атака', before: 5, after: 6, better: 'higher' }] })]);
  assert.match(html, /<header class="hp-mode__head" data-mode="standard"><img class="hp-mode__art" src="\/menu\/banners\/standard-face\.webp"[^>]*\/?><img class="hp-nav-art" src="\/menu\/icons\/mode-standard-80\.webp"[^>]*\/?><h3[^>]*class="hp-mode__title">Стандарт<\/h3>/);
  assert.match(html, /data-mode="battlegrounds"><img class="hp-mode__art" src="\/menu\/banners\/battlegrounds-face\.webp"/);
  assert.match(html, /mode-battlegrounds-80\.webp/);
  assert.match(html, /<h3[^>]*>Поля сражений<\/h3>/);
});

test('general changes are a list; a card named in a line is a button that shows the card', () => {
  const lines = ['Неутомимый отражатель больше не может выпасть с Неприметностью.', 'Анимации нескольких Живых азеритов в игре теперь проигрываются как одна.'];
  const marks = [
    { line: 0, start: 0, end: 21, cardId: 'BG33_Reflector', name: 'Неутомимый отражатель', renderUrl: null },
    { line: 1, start: 20, end: 34, cardId: 'BG28_707', name: 'Живой азерит', renderUrl: 'https://api.kolodahearthstone.com/uploads/cards/BG28_707.png' },
  ];
  const html = page([entry({ id: 'bg', name: 'Страж', mode: 'battlegrounds', format: null, cardId: 'BG36_362', changes: [] })], [{ mode: 'battlegrounds', lines, marks }]);
  assert.match(html, /<ul class="hp-general__list" aria-label="Общие изменения">/);
  assert.match(html, /<button type="button" class="hp-card-mention" data-lightbox-module="card-preview" aria-label="Неутомимый отражатель: показать карту «Неутомимый отражатель»">Неутомимый отражатель<\/button> больше не может/);
  assert.match(html, /Анимации нескольких <button[^>]*aria-label="Живых азеритов: показать карту «Живой азерит»"[^>]*>Живых азеритов<\/button> в игре/);
  const plain = page([knight], [{ mode: 'constructed', lines: ['Без карт в тексте.'] }]);
  assert.match(plain, /<li>Без карт в тексте\.<\/li>/);
});

test('line parts split a sentence around its marks and ignore a mark outside it', () => {
  const mark = (start: number, end: number) => ({ line: 0, start, end, cardId: 'X', name: 'X', renderUrl: null });
  assert.deepEqual(lineParts('ab cd ef', [mark(3, 5)]), ['ab ', mark(3, 5), ' ef']);
  assert.deepEqual(lineParts('ab cd', [mark(3, 99), mark(0, 2)]), [mark(0, 2), ' cd']);
});

test('a text change is the plate "Текст" and carries both texts for the card with no picture', () => {
  const [plate] = changePlates({ mode: 'constructed', changes: [{ label: 'Текст', before: 'a', after: 'b', direction: 'neutral' }] });
  assert.deepEqual([plate.label, plate.before, plate.after, plate.text], ['Текст', null, null, { before: 'a', after: 'b' }]);
  const [mana] = changePlates({ mode: 'constructed', changes: [{ label: 'Стоимость', before: 9, after: 10, better: 'lower', direction: 'nerf' }] });
  assert.deepEqual([mana.label, mana.before, mana.after, mana.direction], ['Мана', '9', '10', 'nerf']);
});

test('a single-picture card prints only the changed fragment with a few words around it; a pair prints none', () => {
  const contract = entry({
    id: 'contract', name: 'Криминальный контракт', cardId: 'CAP_405t6', cardType: 'spell', format: null,
    renderUrl: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/CAP_405t6.png',
    changes: [{ label: 'Текст', before: 'Призывает трех случайных существ за (3).', after: 'Призывает трех случайных существ за (2).' }],
  });
  const long = entry({
    id: 'long', name: 'Длинная', cardId: 'X_1', cardType: 'spell', format: null, renderUrl: 'https://art.hearthstonejson.com/v1/render/latest/ruRU/512x/X_1.png',
    changes: [{ label: 'Текст', before: 'Один два три четыре пять шесть наносит 7 ед. урона всем врагам на поле боя сразу.', after: 'Один два три четыре пять шесть наносит 6 ед. урона всем врагам на поле боя сразу.' }],
  });
  const html = page([contract, long, knight]);
  const cards = html.split('<article').slice(1);
  const [single, longCard, pair] = ['id="card-contract"', 'id="card-long"', 'id="card-knight"'].map(id => cards.find(card => card.includes(id)) as string);
  assert.match(single, /<p class="hp-pc__diff"><span class="hp-plate__text"><span>Призывает трех случайных существ за <\/span><del><span class="sr-only">было <\/span>\(3\)\.<\/del>/);
  assert.match(longCard, /<span>… пять шесть наносит <\/span>/);
  assert.ok(!longCard.includes('Один два'), 'the start of a long text is cut to the words around the edit');
  assert.ok(!pair.includes('hp-pc__diff'));
});
