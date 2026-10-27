import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buttons, elements, labelled, roles, visibleText } from './helpers/renderedMarkup';
import HsReplayDeckFallback from '../src/features/HsReplayDeckFallback';
import {
  AsyncSurfaceState,
  RecoverableSurfaceBoundary,
} from '../src/features/recovery/RecoverableSurface';

// Each state is what a reader meets: a polite status while loading or empty,
// an assertive alert with a way out on failure, never internals.
test('loading is one polite status with its label, sized like the card it replaces', () => {
  const loadingMarkup = renderToStaticMarkup(
    <AsyncSurfaceState variant="loading" title="Загружаем данные" message="Один момент" />,
  );
  assert.deepEqual(roles(loadingMarkup), ['status: Загружаем данные Один момент']);
  assert.equal(elements(loadingMarkup)[0].attrs['aria-live'], 'polite');
  assert.ok(!elements(loadingMarkup).some(element => 'aria-busy' in element.attrs), 'a busy status is never announced');
  assert.deepEqual(buttons(loadingMarkup), []);
  // The loading card keeps the recoverable card's reserved size classes.
  assert.equal(elements(loadingMarkup)[0].attrs.class, 'loading-surface loading-surface--panel recoverable-surface-loading');
  const compactLoadingMarkup = renderToStaticMarkup(
    <AsyncSurfaceState variant="loading" title="Загружаем данные" compact className="extra" />,
  );
  assert.equal(elements(compactLoadingMarkup)[0].attrs.class,
    'loading-surface loading-surface--panel recoverable-surface-loading recoverable-surface-loading--compact extra');
});

test('an empty result is a status with nothing to press', () => {
  const emptyMarkup = renderToStaticMarkup(<AsyncSurfaceState variant="empty" title="Ничего не найдено" compact />);
  assert.deepEqual(roles(emptyMarkup), ['status: Ничего не найдено']);
  assert.deepEqual(buttons(emptyMarkup), []);
});

test('a failure is announced at once and offers the retry it names', () => {
  const errorMarkup = renderToStaticMarkup(
    <AsyncSurfaceState variant="error" title="Не удалось загрузить" message="Попробуйте снова"
      actionLabel="Повторить" onAction={() => {}} />,
  );
  assert.deepEqual(roles(errorMarkup), ['alert: Не удалось загрузить Попробуйте снова Повторить']);
  assert.equal(elements(errorMarkup)[0].attrs['aria-live'], 'assertive');
  assert.deepEqual(buttons(errorMarkup), [{ name: 'Повторить', disabled: false }]);
  assert.doesNotMatch(visibleText(errorMarkup), /stack|secret|undefined/i);
});

test('stale data says it is refreshing and offers a refresh', () => {
  const staleMarkup = renderToStaticMarkup(
    <AsyncSurfaceState variant="stale" title="Данные обновляются" actionLabel="Обновить" onAction={() => {}} />,
  );
  assert.deepEqual(roles(staleMarkup), ['status: Данные обновляются Обновить']);
  assert.equal(elements(staleMarkup)[0].attrs['data-recovery-state'], 'stale');
});

test('a section that crashed shows a retry and an incident code; a stale chunk asks for a reload', () => {
  const failedSection = (error: Error) => {
    const boundary = new RecoverableSurfaceBoundary({ scope: 'standard-meta', children: null });
    boundary.state = { ...boundary.state, ...RecoverableSurfaceBoundary.getDerivedStateFromError(error) };
    return { html: renderToStaticMarkup(<>{boundary.render()}</>), incidentId: boundary.state.failure?.incidentId ?? '' };
  };
  const render = failedSection(new Error('render failed'));
  assert.match(render.incidentId, /^[a-f0-9-]{36}$/i);
  assert.deepEqual(roles(render.html), [
    'alert: Раздел временно недоступен Остальные разделы сайта продолжают работать. Попробуйте ещё раз. Повторить',
  ]);
  assert.ok(visibleText(render.html).endsWith(`Код ошибки: ${render.incidentId}`));
  const chunk = failedSection(new Error('ChunkLoadError'));
  assert.deepEqual(buttons(chunk.html), [{ name: 'Обновить страницу', disabled: false }]);
  assert.deepEqual(roles(chunk.html), [
    'alert: Раздел нужно обновить Новая версия раздела уже доступна. Обновите страницу, чтобы продолжить. Обновить страницу',
  ]);
});

test('a deck the renderer cannot draw is still readable as text', () => {
  const cards = [{ id: 'CARD_TEST_1', dbfId: 101, name: 'Тестовая карта', cost: 3, rarity: 'COMMON', elite: false, count: 2, image: '/test.webp' }];
  const fallbackMarkup = renderToStaticMarkup(<HsReplayDeckFallback cards={cards} />);
  assert.equal(labelled(fallbackMarkup, 'Текстовый состав колоды')?.text.includes('Тестовая карта'), true);
  assert.ok(labelled(fallbackMarkup, '3 маны'));
  assert.ok(labelled(fallbackMarkup, '2 копии'));
});

// The deck renderer's lazy chunk, and the scopes and routes pages hand their
// boundaries, are bundling and wiring inside client pages: no bundler or DOM
// runs here, so these stay guarded by their source.
test('pages load the deck renderer lazily and scope their recovery boundaries', () => {
const deckSource = readFileSync(new URL('../src/features/HsReplayDeckList.tsx', import.meta.url), 'utf8');
const deckRuntimeSource = readFileSync(new URL('../src/features/hsReplayDeckViewRuntime.ts', import.meta.url), 'utf8');
const cardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
assert.match(deckRuntimeSource, /import\('\.\/hsReplayDeckViewVendor'\)/, 'the deck renderer loads as a lazy chunk');
assert.match(deckSource, /import \{ loadDeckView \} from '\.\/hsReplayDeckViewRuntime'/);
for (const source of [deckSource, cardsSource]) {
  assert.doesNotMatch(source, /^import ['"][./]+vendor\/hsreplay-deck-view\/hsreplay-deck-view\.js['"];$/m,
    'a page must not download the deck renderer before it draws a deck');
}
assert.match(deckSource, /data-deck-render-state=\{renderState\}/);

const metaSource = readFileSync(new URL('../src/features/StandardMeta.tsx', import.meta.url), 'utf8');
assert.match(metaSource, /scope="standard-meta"/);
assert.match(metaSource, /'\/api\/standard-meta'/);
assert.match(metaSource, /'\/api\/standard-meta\/teaser'/);

const archetypesSource = readFileSync(new URL('../src/features/ConstructedArchetypes.tsx', import.meta.url), 'utf8');
assert.match(archetypesSource, /scope="constructed-archetypes"/);
assert.match(archetypesSource, /variant="empty"/);
assert.match(archetypesSource, /detailMatch = currentPath\.match/);
assert.match(archetypesSource, /\(standard\|wild\)/);
});
