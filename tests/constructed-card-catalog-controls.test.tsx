import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ConstructedCardCatalogSearch from '../src/features/ConstructedCardCatalogSearch.js';
import ConstructedCardDownloadButton, {
  constructedCardDownloadFilename,
} from '../src/features/ConstructedCardDownloadButton.js';

const searchMarkup = renderToStaticMarkup(
  <ConstructedCardCatalogSearch
    query="зиллиакс"
    total={3}
    pending={false}
    onChange={() => undefined}
    onClear={() => undefined}
  />,
);

assert.match(searchMarkup, /type="search"/, 'catalog search must use the native search input type');
assert.match(searchMarkup, /aria-label="Поиск карт"/, 'catalog search must expose an accessible name');
assert.match(searchMarkup, /Название, английское имя или ID/, 'catalog search must explain what can be searched');
assert.match(searchMarkup, /Найдено: 3/, 'catalog search must announce the result count');
assert.match(searchMarkup, /aria-live="polite"/, 'catalog search updates must be announced without interrupting the user');
assert.match(searchMarkup, /Очистить поиск/, 'a populated catalog search must expose a compact clear action');

const pendingMarkup = renderToStaticMarkup(
  <ConstructedCardCatalogSearch
    query="андуин"
    total={12}
    pending
    onChange={() => undefined}
    onClear={() => undefined}
  />,
);
assert.match(pendingMarkup, /Ищем…/, 'the search control must explain when fresh results are pending');

assert.equal(
  constructedCardDownloadFilename('Зиллиакс Делокс 3000', 'TOY_330'),
  'Зиллиакс-Делокс-3000-TOY_330.webp',
);
assert.equal(
  constructedCardDownloadFilename('Ая: «Черная Лапа»?', 'JAIL_504'),
  'Ая-«Черная-Лапа»-JAIL_504.webp',
  'download filenames must remove filesystem-reserved punctuation',
);

const downloadMarkup = renderToStaticMarkup(
  <ConstructedCardDownloadButton
    cardId="TOY_330"
    cardName="Зиллиакс Делокс 3000"
    href="https://cdn.hearthpulse.net/api/card-image/105909/full.webp?v=blizzard-test"
  />,
);
assert.match(downloadMarkup, /download="Зиллиакс-Делокс-3000-TOY_330\.webp"/);
assert.match(downloadMarkup, /aria-label="Скачать карту «Зиллиакс Делокс 3000» в полном качестве"/);
assert.match(downloadMarkup, /\/api\/card-image\/105909\/full\.webp\?v=blizzard-test/);
assert.doesNotMatch(
  downloadMarkup,
  /cdn\.arena\.hs-manacost\.ru/,
  'downloads must stay same-origin so browser download behavior remains reliable',
);

const standardCardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
const standardCardsCss = readFileSync(new URL('../src/features/StandardCards.css', import.meta.url), 'utf8');
assert.match(standardCardsSource, /SEARCH_REQUEST_DEBOUNCE_MS\s*=\s*250/,
  'catalog search must debounce remote requests instead of firing for every keystroke');
assert.match(standardCardsSource, /loading && !data/,
  'the first load may show a loading state while later refreshes keep the current cards visible');
assert.match(standardCardsSource, /<ConstructedCardCatalogSearch/,
  'the catalog must use the accessible search control');
assert.match(standardCardsSource, /<ConstructedCardDownloadButton/,
  'every gallery card must expose the full-quality download action');
assert.match(standardCardsSource, /constructedCardImage\(card/,
  'all catalog views must use the shared canonical-ID-first image identity rule');
assert.doesNotMatch(standardCardsSource, /constructedCardRenderImage\(card\.dbf \?\? card\.card_id/,
  'catalog images must not prefer DBF over a canonical card ID');
assert.match(standardCardsCss, /\.constructed-cards__gallery-card:hover\s+\.constructed-card-download[\s\S]*opacity:\s*1/s,
  'the compact download action must become visible when the card is hovered');
assert.doesNotMatch(standardCardsCss, /\.constructed-cards__gallery-card:focus-within/,
  'focusing the download action must not leave the whole card in its hover state');
assert.match(standardCardsCss, /\.constructed-cards__gallery-card:has\(>\s*\.constructed-cards__gallery-card-link:focus-visible\)/,
  'keyboard focus on the card link must retain the same visual affordance as hover');
assert.match(standardCardsCss, /@media\s*\(hover:\s*none\)\s*and\s*\(pointer:\s*coarse\)/,
  'the download action must remain available on touch devices without hover');

console.log('constructed-card catalog search and download controls passed');
