import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HsReplayDeckFallback from '../src/features/HsReplayDeckFallback';
import {
  AsyncSurfaceState,
  RecoverableSurfaceBoundary,
} from '../src/features/recovery/RecoverableSurface';

// Loading is the site-wide LoadingSurface, sized like the card it replaces.
const loadingMarkup = renderToStaticMarkup(
  <AsyncSurfaceState variant="loading" title="Загружаем данные" message="Один момент" />,
);
assert.match(loadingMarkup, /role="status"/);
assert.match(loadingMarkup, /aria-live="polite"/);
assert.doesNotMatch(loadingMarkup, /aria-busy/);
assert.match(loadingMarkup, /data-loading-surface="panel"/);
assert.match(loadingMarkup, /class="loading-surface loading-surface--panel recoverable-surface-loading"/);
assert.match(loadingMarkup, /<strong>Загружаем данные<\/strong><span>Один момент<\/span>/);
assert.doesNotMatch(loadingMarkup, /recoverable-surface__mark/);
const compactLoadingMarkup = renderToStaticMarkup(
  <AsyncSurfaceState variant="loading" title="Загружаем данные" compact className="extra" />,
);
assert.match(compactLoadingMarkup, /recoverable-surface-loading recoverable-surface-loading--compact extra/);

const emptyMarkup = renderToStaticMarkup(
  <AsyncSurfaceState variant="empty" title="Ничего не найдено" compact />,
);
assert.match(emptyMarkup, /role="status"/);
assert.match(emptyMarkup, /recoverable-surface--compact/);
assert.doesNotMatch(emptyMarkup, /<button/);

const errorMarkup = renderToStaticMarkup(
  <AsyncSurfaceState
    variant="error"
    title="Не удалось загрузить"
    message="Попробуйте снова"
    actionLabel="Повторить"
    onAction={() => {}}
  />,
);
assert.match(errorMarkup, /role="alert"/);
assert.match(errorMarkup, /aria-live="assertive"/);
assert.match(errorMarkup, /<button[^>]*>Повторить<\/button>/);
assert.doesNotMatch(errorMarkup, /stack|secret|undefined/i);

const staleMarkup = renderToStaticMarkup(
  <AsyncSurfaceState variant="stale" title="Данные обновляются" actionLabel="Обновить" onAction={() => {}} />,
);
assert.match(staleMarkup, /data-recovery-state="stale"/);
assert.match(staleMarkup, /Обновить/);

const renderFailure = RecoverableSurfaceBoundary.getDerivedStateFromError(new Error('render failed'));
assert.equal(renderFailure.failure?.kind, 'render');
assert.match(renderFailure.failure?.incidentId || '', /^[a-f0-9-]{36}$/i);
const chunkFailure = RecoverableSurfaceBoundary.getDerivedStateFromError(new Error('ChunkLoadError'));
assert.equal(chunkFailure.failure?.kind, 'chunk');

const cards = [
  {
    id: 'CARD_TEST_1',
    dbfId: 101,
    name: 'Тестовая карта',
    cost: 3,
    rarity: 'COMMON',
    elite: false,
    count: 2,
    image: '/test.webp',
  },
];
const fallbackMarkup = renderToStaticMarkup(<HsReplayDeckFallback cards={cards} />);
assert.match(fallbackMarkup, /aria-label="Текстовый состав колоды"/);
assert.match(fallbackMarkup, /Тестовая карта/);
assert.match(fallbackMarkup, /aria-label="3 маны"/);
assert.match(fallbackMarkup, /aria-label="2 копии"/);

const deckSource = readFileSync(new URL('../src/features/HsReplayDeckList.tsx', import.meta.url), 'utf8');
const deckRuntimeSource = readFileSync(new URL('../src/features/hsReplayDeckViewRuntime.ts', import.meta.url), 'utf8');
const cardsSource = readFileSync(new URL('../src/features/StandardCards.tsx', import.meta.url), 'utf8');
assert.match(deckRuntimeSource, /import\('\.\/hsReplayDeckViewVendor'\)/, 'the deck renderer loads as a lazy chunk');
for (const source of [deckSource, cardsSource]) {
  assert.match(source, /import \{ loadDeckView \} from '\.\/hsReplayDeckViewRuntime'/);
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
assert.match(archetypesSource, /setRevision\(value => value \+ 1\)/);
assert.match(archetypesSource, /variant="empty"/);
assert.match(archetypesSource, /'\/api\/constructed-archetypes'/);
assert.match(archetypesSource, /'\/api\/constructed-archetypes\/teaser'/);
assert.match(archetypesSource, /detailMatch = currentPath\.match/);
assert.match(archetypesSource, /\(standard\|wild\)/);

console.log('Recoverable surface tests passed');
