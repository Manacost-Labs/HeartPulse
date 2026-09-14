import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RouteLoadingSurface } from '../src/app/shell/RouteLoadingSurface.js';

const html = renderToStaticMarkup(<RouteLoadingSurface minHeight={640} />);

assert.match(html, /class="route-fallback/);
assert.match(html, /aria-busy="true"/);
assert.match(html, /role="status"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /Собираем раздел/);
assert.match(html, /min-height:640px/);

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(appSource, /key=\{`\$\{routeView\}:\$\{currentPath\}`\}/);
assert.match(appSource, /arena-content anim-fade-up/);

console.log('route loading surface assertions passed');
