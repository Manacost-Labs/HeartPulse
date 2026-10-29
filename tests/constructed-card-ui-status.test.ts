import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EMPTY_CONSTRUCTED_CARD_FILTERS, constructedCardCatalogUrl } from '../src/modules/constructedCards/model/catalogQuery';
import { loadConstructedCardDetail } from '../src/features/constructedCardDetailPrefetch';
import fc from 'fast-check';
import { number, percent } from '../src/features/constructedCardRecord';
import { buttons, elements, headings, importWithoutStyles, labelled, links, visibleText } from './helpers/renderedMarkup';
import {
  constructedCardDataNotice,
  constructedCardRequestError,
} from '../src/features/constructedCardRequestState.js';

assert.deepEqual(constructedCardRequestError('detail', 404, ''), {
  title: 'Карта не найдена',
  message: 'Проверьте адрес карты или вернитесь в библиотеку.',
  retry: false,
  notFound: true,
});
assert.deepEqual(constructedCardRequestError('detail', 503, 'upstream private exception'), {
  title: 'Данные карты временно недоступны',
  message: 'Сервис обновляется. Повторите попытку через минуту.',
  retry: true,
  notFound: false,
});
assert.equal(constructedCardRequestError('list', 503, '').title, 'Библиотека карт временно недоступна');
assert.equal(constructedCardRequestError('list', 503, '').retry, true);
assert.doesNotMatch(constructedCardRequestError('detail', 503, 'QA_PRIVATE_ERROR').message, /QA_PRIVATE/,
  'browser copy must not echo internal upstream errors');

assert.equal(
  constructedCardDataNotice({ dataStatus: 'stale', partial: false }),
  null,
  'a complete last-known-good catalog is still usable and should not interrupt reading',
);
assert.equal(
  constructedCardDataNotice({ dataStatus: 'stale', partial: true }),
  'Часть подробной информации временно недоступна. Основные данные карты восстановлены из библиотеки.',
);
assert.equal(constructedCardDataNotice({ dataStatus: 'fresh', partial: false }), null);
assert.equal(
  constructedCardDataNotice({
    dataStatus: 'fresh',
    partial: false,
    warning: 'Статистика карт временно недоступна.',
  }),
  'Статистика карт временно недоступна.',
  'a fresh raw catalog must still surface a simultaneous statistics outage',
);
assert.equal(
  constructedCardDataNotice({
    dataStatus: 'stale',
    partial: false,
    warning: 'Статистика карт временно недоступна.',
  }),
  'Статистика карт временно недоступна.',
  'a concrete server warning must remain visible without an extra stale-data banner',
);

// The card page as a reader opens it from the server seed: related cards and
// generated pools, their lightbox buttons and links, the statistics controls.
const { default: StandardCardDetail } = await importWithoutStyles<typeof import('../src/features/StandardCardDetail')>(
  new URL('../src/features/StandardCardDetail', import.meta.url));
const zilliax = {
  card_id: 'TOY_330', dbf: 105909, name: { ru: 'Зиллиакс Делюкс 3000', en: 'Zilliax Deluxe 3000' }, text: { ru: 'Соберите модули.' },
  class: 'NEUTRAL', card_type: { slug: 'MINION', name_ru: 'Существо' }, rarity: 'LEGENDARY', mana_cost: 0, attack: 0, health: 0,
  card_set: 'WHIZBANGS_WORKSHOP', collectible: true, mechanics: [], formats: [{ slug: 'standard' }],
  related_cards_localized: [{ heading: { ru: 'Модули', en: 'Modules' }, cards: [{
    card_id: 'TOY_330t5', name: { ru: 'Модуль' }, mana_cost: 5, card_image_url: '/x.webp', wiki_url: 'https://hearthstone.wiki.gg/wiki/Module',
  }] }],
  wiki: { generated_card_pools: [{ pool: 'Cards banned from E.T.C.’s band', cards: [
    { card_id: 'CORE_1', name: { ru: 'Карта пула' }, can_open: true },
    { card_id: 'EXT', name: { ru: 'Внешняя' }, url: 'https://hearthstone.wiki.gg/wiki/Ext' },
  ] }] },
};
const detailHtml = renderToStaticMarkup(React.createElement(StandardCardDetail, {
  currentPath: '/standard/cards/standard/TOY_330/', navigatePath: () => undefined, statsAccess: false,
  statsAccessLoading: false, authUser: null, onRefreshSubscription: async () => undefined, initialCard: zilliax,
} as unknown as React.ComponentProps<typeof StandardCardDetail>));
const detailText = visibleText(detailHtml);

test('the card page groups tokens and companions in Russian, each opening in the lightbox', () => {
  assert.ok(headings(detailHtml).includes('h2 Токены, награды и связанные карты · 1'));
  assert.ok(headings(detailHtml).includes('h3 Модули'));
  assert.ok(buttons(detailHtml).some(button => button.name === 'Открыть карту «Модуль» в полном размере'));
  assert.ok(detailText.includes('Модули Modules 1 Модуль TOY_330t5 Пулы генерации'),
    'a related card shows its name and ID, without its mana cost');
  assert.ok(!links(detailHtml).some(link => link.href.includes('wiki/Module')), 'no redundant wiki link on related cards');
  assert.ok(elements(detailHtml).some(element => element.tag === 'img'
    && element.attrs.src === '/api/card-image/TOY_330t5/full.webp?v=constructed-cards-patch-36-2-20260805'),
  'related-card renders come from the same-origin card-image cache');
});

test('generated pools are localized, open in the lightbox and link to their cards', () => {
  assert.ok(detailText.includes('Пулы генерации · 1 Карты, недоступные для группы E.T.C. 2 карт'));
  assert.ok(buttons(detailHtml).some(button => button.name === 'Открыть карту «Карта пула» в полном размере'));
  assert.deepEqual(links(detailHtml).filter(link => ['Карта пула', 'Внешняя'].includes(link.name)), [
    { name: 'Карта пула', href: '/standard/cards/standard/CORE_1/' },
    { name: 'Внешняя', href: 'https://hearthstone.wiki.gg/wiki/Ext' },
  ]);
});

test('the card page offers its own statistics format, rank and period', () => {
  assert.equal(labelled(detailHtml, 'Формат статистики')?.attrs.role, 'group');
  assert.deepEqual(buttons(detailHtml).filter(button => ['Стандарт', 'Вольный'].includes(button.name)).map(button => button.name),
    ['Стандарт', 'Вольный']);
  assert.ok(detailText.includes('Ранг Легенда Период Последний день'));
});

test('the selected period and rank reach the list and detail requests', async () => {
  assert.equal(constructedCardCatalogUrl({ format: 'wild', period: '7d', rank: 'diamond', page: 2, perPage: 60,
    filters: EMPTY_CONSTRUCTED_CARD_FILTERS, query: '' }),
  '/api/constructed-cards?format=wild&period=7d&rank=diamond&page=2&perPage=60&sort=set&direction=asc');
  const requested: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    await loadConstructedCardDetail({ cardId: 'TOY_330', format: 'standard', statsFormat: 'wild', period: '14d', rank: 'platinum', statsAccess: true });
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(requested, ['/api/constructed-cards/TOY_330?format=standard&statsFormat=wild&period=14d&rank=platinum']);
});

// Recommended decks, the history chart and server warnings arrive after mount;
// grids and deck heights are layout; navigation context and catalog filters are
// wiring in the client pages. No DOM or layout engine runs here, so these stay
// guarded by their source.
const standardCardsSource = ['StandardCards.tsx', 'StandardCardDetail.tsx']
  .map(file => readFileSync(new URL(`../src/features/${file}`, import.meta.url), 'utf8')).join('\n');
const cardHistorySource = readFileSync(new URL('../src/features/useConstructedCardHistory.ts', import.meta.url), 'utf8');
const catalogSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
assert.match(standardCardsSource, /warning:\s*typeof payload\.warning/,
  'the detail component must pass the server warning into its visible data-state notice');
assert.match(catalogSource, /label="Период"/, 'the catalog must expose the statistics period as a primary visible filter');
assert.match(catalogSource, /label="Ранг"/, 'the catalog must expose the statistics rank as a visible filter');

const standardCardsCss = readFileSync(new URL('../src/features/StandardCards.css', import.meta.url), 'utf8');
assert.match(standardCardsCss, /\.constructed-card-detail__pool-cards\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s,
  'wide generated pools must use a stable five-column grid');
assert.doesNotMatch(standardCardsCss, /\.constructed-card-detail__pool-cards\s*\{[^}]*auto-fill/s,
  'wide generated pools must not expand into an arbitrary number of tiny columns');

const cardDeckComponent = standardCardsSource.slice(
  standardCardsSource.indexOf('function ConstructedDeckCard'),
  standardCardsSource.indexOf('function ConstructedCardDecks'),
);
assert.match(cardDeckComponent, /const copyDeck = async \(\) =>/,
  'card-page deck actions must copy the complete deck code');
assert.match(cardDeckComponent, /<button[^>]+onClick=\{copyDeck\}[\s\S]*Скопировать код[\s\S]*<\/button>/,
  'each recommended deck must expose the requested copy-code button');
assert.doesNotMatch(cardDeckComponent, /builderHref|Открыть в конструкторе/,
  'the card-page deck action must not redirect into the internal builder');
assert.match(cardDeckComponent, /fetchWithDeadline\(`\/api\/deck\/resolve\?\$\{query\}`/,
  'recommended decks must resolve into the same native card rows used by the deck builder, with a deadline');
assert.match(cardDeckComponent, /<DeckListView/,
  'recommended decks must render through the native deck-list component');
assert.doesNotMatch(cardDeckComponent, /\/preview\?format=|constructed-card-detail__deck-preview/,
  'recommended decks must not depend on generated DeckView preview images');
assert.match(standardCardsCss, /\.constructed-card-detail__deck-list\s*\{[^}]*height:\s*auto[^}]*overflow:\s*visible/s,
  'native recommended-deck lists must expand to their full height without an internal scrollbar');
assert.doesNotMatch(standardCardsCss, /\.constructed-card-detail__deck\s*\{[^}]*grid-template-rows:\s*\d+px/s,
  'recommended-deck cards must not constrain the native deck list to a fixed-height row');
assert.doesNotMatch(standardCardsCss, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.constructed-card-detail__deck-list\s*\{[^}]*height:\s*\d+px/s,
  'mobile recommended-deck lists must remain fully expanded');
assert.match(standardCardsSource, /navigateWithConstructedCardContext/,
  'card and back navigation must retain the selected statistics context');
assert.match(cardHistorySource, /\/history\?\$\{params\}/,
  'an entitled card detail must request its persisted statistics history');
assert.match(standardCardsSource, /serverStatsAccess && \(\s*<ConstructedCardHistoryChart/,
  'the history chart must follow the server-side statistics entitlement');

console.log('constructed-card Russian unavailable/stale UI contracts passed');

test('numbers group thousands with a no-break space and keep the Russian decimal comma', () => {
  assert.equal(number(2697), '2\u00a0697');
  assert.equal(number(1234567), '1\u00a0234\u00a0567');
  assert.equal(number(999), '999');
  assert.equal(number(5.45), '5,45');
  assert.equal(number(0), '0');
  assert.equal(number(null), 'Нет данных');
  assert.equal(percent(1.88), '1,88%');
  assert.equal(percent(18.4), '18,4%');
  assert.equal(percent(undefined), 'Нет данных');
});

test('a grouped number never holds a narrow or breaking space', () => {
  fc.assert(fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), value => {
    const shown = number(value);
    return !/[\u202f\u2009 ]/.test(shown) && shown.replaceAll('\u00a0', '') === String(value);
  }));
});

const { StatsRows } = await importWithoutStyles<typeof import('../src/features/ConstructedCardStats')>(
  new URL('../src/features/ConstructedCardStats', import.meta.url));
const { CardStatsRows, StatisticsControls } = await importWithoutStyles<typeof import('../src/features/ConstructedCardStatistics')>(
  new URL('../src/features/ConstructedCardStatistics', import.meta.url));
const cardStats = {
  deckPopularity: 1.88, deckWinrate: 39.12, averageCopies: 1.95, timesPlayed: 2697, winrateWhenPlayed: 43.86,
  winrateWhenDrawn: 43.95, keepPercentage: 92.84, openingHandWinrate: 42.65, averageTurnsInHand: 2.2, averageTurnPlayed: 5.45,
};

test('the card page names each metric in plain Russian and explains it under the value', () => {
  const html = renderToStaticMarkup(React.createElement(CardStatsRows, { stats: cardStats }));
  assert.deepEqual(elements(html).filter(element => element.tag === 'dt').map(element => element.text), [
    'Популярность', 'Винрейт колод с картой', 'Винрейт, если сыграна', 'Винрейт, если взята', 'Оставляют в муллигане',
    'Винрейт из стартовой руки', 'Обычно разыгрывают на ходу', 'Копий в колоде', 'Партий в выборке',
  ]);
  assert.ok(visibleText(html).startsWith('Популярность 1,88% В скольких колодах выборки есть карта '
    + 'Винрейт колод с картой 39,12% Доля побед колод, в которых есть карта'));
  // `visibleText` folds the no-break space into a plain one; the markup below keeps it.
  assert.ok(visibleText(html).endsWith('Партий в выборке 2 697 Объём выборки'));
  assert.ok(html.includes('2\u00a0697'), 'the sample size keeps its digits together');
  assert.equal(elements(html).filter(element => element.attrs.title !== undefined).length, 0,
    'the explanations are printed, not hidden in a tooltip');
});

test('the hover summary in the card list keeps the same names without the explanations', () => {
  const html = renderToStaticMarkup(React.createElement(StatsRows, { stats: cardStats }));
  assert.deepEqual(elements(html).filter(element => element.tag === 'dt').map(element => element.text), [
    'Популярность', 'Винрейт колод с картой', 'Винрейт, если сыграна', 'Винрейт, если взята', 'Оставляют в муллигане',
    'Партий в выборке',
  ]);
  assert.ok(!visibleText(html).includes('В скольких колодах'));
});

test('the statistics switch gives every offered format its own pressed-state segment', () => {
  const html = renderToStaticMarkup(React.createElement(StatisticsControls, {
    formats: [
      { id: 'standard', label: 'Стандарт', icon: '/a.webp' },
      { id: 'wild', label: 'Вольный', icon: '/b.webp' },
      { id: 'arena', label: 'Арена', icon: '/c.webp' },
    ],
    format: 'wild', onFormatChange: () => undefined,
    rank: 'legend', rankOptions: [{ value: 'legend', label: 'Легенда' }], onRankChange: () => undefined,
    period: '1d', periodOptions: [{ value: '1d', label: 'Последний день' }], onPeriodChange: () => undefined,
  }));
  assert.equal(labelled(html, 'Формат статистики')?.attrs.role, 'group');
  const segments = elements(html).filter(element => element.tag === 'button' && element.attrs['aria-pressed'] !== undefined);
  assert.deepEqual(segments.map(segment => [segment.name, segment.attrs['aria-pressed']]),
    [['Стандарт', 'false'], ['Вольный', 'true'], ['Арена', 'false']]);
  assert.ok(visibleText(html).startsWith('Формат Стандарт Вольный Арена Ранг Легенда Период Последний день'));
});
