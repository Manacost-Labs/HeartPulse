import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LoadingBlock, LoadingSurface } from '../src/shared/ui/LoadingSurface';

// One loading surface for every data section: a single polite status with its
// label, placeholder blocks hidden from assistive technology, and the owning
// surface's class to reserve the content's size.
const panel = renderToStaticMarkup(<LoadingSurface label="Загружаем мету" detail="Получаем срез" />);
assert.match(panel, /^<div class="loading-surface loading-surface--panel" role="status" aria-live="polite" aria-busy="true" data-loading-surface="panel">/);
assert.match(panel, /<span class="loading-surface__caption"><strong>Загружаем мету<\/strong><span>Получаем срез<\/span><\/span>/);
assert.match(panel, /<div class="loading-surface__blocks" aria-hidden="true">(<span class="loading-block loading-block--line" aria-hidden="true"><\/span>){3}<\/div>/);
assert.equal(panel.match(/role="status"/g)?.length, 1, 'a loader announces once');

const quiet = renderToStaticMarkup(<LoadingSurface label="Загружаем архетипы" quiet layout="rows" count={2} className="archetypes-loading" />);
assert.match(quiet, /class="loading-surface loading-surface--rows archetypes-loading"/);
assert.match(quiet, /class="loading-surface__caption sr-only"><strong>Загружаем архетипы<\/strong><\/span>/,
  'a quiet surface keeps its label for screen readers');
assert.equal(quiet.match(/class="loading-block loading-block--row"/g)?.length, 2);

const custom = renderToStaticMarkup(
  <LoadingSurface label="Загружаем косметику" quiet layout="grid" blocksClassName="cosmetics-grid">
    <LoadingBlock className="cosmetics-skeleton" />
  </LoadingSurface>,
);
assert.doesNotMatch(custom, /loading-block--/, 'custom blocks keep their own size');
assert.match(custom, /<div class="loading-surface__blocks cosmetics-grid" aria-hidden="true"><span class="loading-block cosmetics-skeleton" aria-hidden="true"><\/span><\/div>/);

const styles = readFileSync(new URL('../src/shared/ui/LoadingSurface.css', import.meta.url), 'utf8');
assert.match(styles, /@layer components\s*\{/, 'surface classes outside the layer override its defaults');
assert.match(styles, /min-block-size:\s*var\(--loading-surface-min-block,/);
assert.doesNotMatch(styles, /\.loading-surface--\w+ \.loading-block\b/, 'layouts size only their default blocks');
assert.doesNotMatch(styles, /@keyframes|background-position|!important/);

console.log('loading surface contracts passed');
