import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteLoadingSurface } from '../src/app/shell/RouteLoadingSurface.js';
import { RouteContentReveal } from '../src/app/shell/RouteContentReveal.js';

const html = renderToStaticMarkup(<RouteLoadingSurface minHeight={640} />);

assert.match(html, /class="route-fallback/);
assert.match(html, /aria-busy="true"/);
assert.match(html, /role="status"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /Собираем раздел/);
assert.equal((html.match(/class="route-fallback__line(?: |")/g) ?? []).length, 3);
assert.match(html, /min-height:640px/);

const revealHtml = renderToStaticMarkup(<RouteContentReveal><p>Готовый раздел</p></RouteContentReveal>);
assert.match(revealHtml, /class="route-content-reveal"/);
assert.match(revealHtml, /Готовый раздел/);

console.log('route loading surface assertions passed');
