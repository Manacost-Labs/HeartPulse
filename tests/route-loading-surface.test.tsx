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
const deferredRoutesCss = readFileSync(new URL('../src/features/DeferredRoutes.css', import.meta.url), 'utf8');
assert.doesNotMatch(appSource, /key=\{`\$\{routeView\}:\$\{currentPath\}`\}/,
  'the route shell must stay mounted so navigation does not flash');
assert.match(appSource, /startViewTransition/,
  'supported browsers must animate the stable route shell');
assert.match(appSource, /startViewTransition && !window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/,
  'reduced-motion users must bypass route animation');
assert.match(appSource, /flushSync\(update\)/,
  'a View Transition must capture the committed destination route, not a deferred React update');
assert.match(appSource, /commitRouteUpdate\(updateRoute\)/,
  'forward navigation and browser history navigation must share one transition policy');
assert.match(indexCss, /::view-transition-group\(route-content\)\s*\{[^}]*animation-duration:\s*300ms/,
  'route geometry must settle over the same calm interval as the destination frame');
assert.match(indexCss, /::view-transition-group\(route-content\)\s*\{[^}]*animation-timing-function:\s*cubic-bezier\(0\.22, 1, 0\.36, 1\)/,
  'route geometry and the destination frame must use the same easing');
assert.match(indexCss, /route-content-leave 160ms cubic-bezier\(0\.4, 0, 1, 1\) both/,
  'the outgoing frame must clear without lingering over the destination');
assert.match(indexCss, /route-content-enter 300ms cubic-bezier\(0\.22, 1, 0\.36, 1\) both/,
  'the incoming frame must use the shared calm route timing');
assert.match(indexCss, /@keyframes route-content-leave\s*\{\s*to\s*\{\s*opacity:\s*0;\s*\}\s*\}/,
  'the outgoing frame must fade instead of sliding against the incoming page');
assert.match(indexCss, /@keyframes route-content-enter\s*\{\s*from\s*\{\s*opacity:\s*0\.24;\s*\}\s*\}/,
  'the destination must remain partially visible while the old frame clears');
assert.doesNotMatch(indexCss, /@keyframes route-content-(?:leave|enter)[\s\S]{0,160}translateY/,
  'route snapshots must not move in opposing directions');
assert.match(indexCss, /::view-transition-old\(root\)[\s\S]*animation:\s*none/,
  'the browser default root cross-fade must not overlap the content transition');
assert.match(indexCss, /::view-transition-group\(root\)[\s\S]*animation:\s*none/,
  'the browser default root group animation must not overlap the content transition');
assert.doesNotMatch(indexCss, /\.route-fallback\s*\{\s*animation:/,
  'the lazy route fallback must not animate separately after the route transition begins');
assert.doesNotMatch(deferredRoutesCss, /\.profile-page,[\s\S]*animation:\s*fadeIn/,
  'profile and login routes must not add a different page-entry animation');
assert.match(appSource, /navigateLocation\(new URL\('\/\?login', window\.location\.origin\), activeTab\)/,
  'opening login must preserve the page beneath the authentication surface');

console.log('route loading surface assertions passed');
