import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buttons, labelled, visibleText } from './helpers/renderedMarkup';

const { PaidMetricLock, PaidFilterLock } = await (await import('./helpers/renderedMarkup')).importWithoutStyles<
  typeof import('../src/shared/ui/PaidLocks')>(new URL('../src/shared/ui/PaidLocks', import.meta.url));

const open = () => undefined;
// Bubbling and opening the offer are checked in a browser: tests/paid-locks-browser.test.mjs.

test('a metric lock is a named button with the caption and no value', () => {
  const html = renderToStaticMarkup(React.createElement('table', null, React.createElement('tbody', null,
    React.createElement('tr', null, React.createElement('td', null,
      React.createElement(PaidMetricLock, { label: 'Винрейт', onOpen: open }))))));
  assert.deepEqual(buttons(html), [{ name: 'Винрейт: по подписке. Узнать, как открыть', disabled: false }]);
  assert.equal(visibleText(html), 'По подписке');
});

test('the card variant is a button too, and without onOpen it is the provider lock', () => {
  const card = renderToStaticMarkup(React.createElement(PaidMetricLock, { label: 'Игры', variant: 'card', onOpen: open }));
  assert.equal(buttons(card).length, 1);
  const viaProvider = renderToStaticMarkup(React.createElement(PaidMetricLock, { label: 'Игры' }));
  assert.deepEqual(buttons(viaProvider), [{ name: 'Игры: по подписке. Узнать, как открыть', disabled: false }]);
  assert.equal(visibleText(viaProvider), 'По подписке');
});

test('a filter lock keeps the label and the default value, with an accessible name', () => {
  const html = renderToStaticMarkup(React.createElement(PaidFilterLock, {
    label: 'Мана', value: 'Любая мана', icon: '/assets/mana-64.webp', onOpen: open }));
  assert.ok(labelled(html, 'Мана (фильтр): по подписке. Узнать, как открыть'));
  assert.match(visibleText(html), /Мана.*Любая мана/);
});
