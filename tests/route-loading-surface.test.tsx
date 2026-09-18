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
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /key=\{`\$\{routeView\}:\$\{currentPath\}`\}/,
  'the route shell must stay mounted so navigation does not flash');
assert.match(appSource, /startViewTransition/,
  'supported browsers must animate the stable route shell');
assert.match(appSource, /flushSync\(update\)/,
  'a View Transition must capture the committed destination route, not a deferred React update');
assert.match(appSource, /commitRouteUpdate\(updateRoute\)/,
  'forward navigation and browser history navigation must share one transition policy');
assert.match(indexCss, /route-content-leave 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/,
  'the outgoing frame must use the shared route timing');
assert.match(indexCss, /route-content-enter 220ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/,
  'the incoming frame must use the shared route timing');
assert.match(indexCss, /::view-transition-old\(root\)[\s\S]*animation:\s*none/,
  'the browser default root cross-fade must not overlap the content transition');
assert.match(appSource, /navigateLocation\(new URL\('\/\?login', window\.location\.origin\), activeTab\)/,
  'opening login must preserve the page beneath the authentication surface');

console.log('route loading surface assertions passed');
