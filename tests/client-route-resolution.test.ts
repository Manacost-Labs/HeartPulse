import assert from 'node:assert/strict';
import {
  clientRouteView,
  historyRouteKnowledge,
  initialClientRouteResolution,
  settledClientRouteResolution,
  shouldPreserveInitialServerMeta,
  withHistoryRouteKnowledge,
} from '../src/routing/clientRouteResolution';

const appModule = await import('../src/App');
assert.equal(typeof appModule.default, 'function', 'the application shell must remain import-safe without a browser DOM');

const server404Hint = '/missing/path';
const production404 = initialClientRouteResolution('/missing/path', server404Hint);
assert.equal(clientRouteView(production404, '/missing/path'), 'not-found', 'the server marker must prevent a home-state flash');
assert.equal(
  clientRouteView(initialClientRouteResolution('/', server404Hint), '/'),
  'known',
  'an in-place remount after leaving the bootstrap 404 must not reuse its stale server marker',
);
assert.equal(
  shouldPreserveInitialServerMeta('/missing/path/', server404Hint, true),
  true,
  'the first metadata pass must not replace an authoritative server 404 with inventory-only index metadata',
);
assert.equal(
  shouldPreserveInitialServerMeta('/articles', server404Hint, false),
  false,
  'later SPA navigation must be free to resolve normal metadata after the bootstrap 404',
);
assert.equal(
  shouldPreserveInitialServerMeta('/standard/cards/standard/CARD_1', '/standard/cards/standard/CARD_1', true),
  true,
  'the first metadata pass must preserve authoritative entity metadata until detail hydration',
);

const home = initialClientRouteResolution('/');
assert.equal(clientRouteView(home, '/'), 'known');
assert.equal(clientRouteView(home, '/articlesevil'), 'pending', 'SPA navigation must hide the previous page while policy resolution is pending');

const malformed = settledClientRouteResolution('/heroes/not-a-number/', false);
assert.equal(clientRouteView(malformed, '/heroes/not-a-number'), 'not-found', 'policy rejection must settle on the app-level 404');

const articles = settledClientRouteResolution('/articles', true);
assert.equal(clientRouteView(articles, '/articles/'), 'known', 'a valid SPA destination must recover from a previous 404');

const unavailable = { pathname: '/standard/cards/classic/CATA_785', status: 'unavailable' as const };
assert.equal(clientRouteView(unavailable, '/standard/cards/classic/CATA_785'), 'unavailable', 'policy load errors must never classify malformed details as known');

assert.deepEqual(
  withHistoryRouteKnowledge({ tab: 'home', login: true, custom: 'preserved' }, true),
  { tab: 'home', login: true, custom: 'preserved', routeKnown: true },
  'known-route history metadata must preserve unrelated state for Back/Forward navigation',
);
assert.deepEqual(
  withHistoryRouteKnowledge(withHistoryRouteKnowledge({ tab: 'home', login: true }, true), false),
  { tab: 'home', login: true, routeKnown: false },
  'a rejected optimistic route must update only its route knowledge',
);
assert.deepEqual(withHistoryRouteKnowledge(null, true), { routeKnown: true });
assert.equal(historyRouteKnowledge({ routeKnown: true }), true);
assert.equal(historyRouteKnowledge({ routeKnown: false }), false);
assert.equal(historyRouteKnowledge({ routeKnown: 'true' }), null);
assert.equal(historyRouteKnowledge(null), null);

const originalCardsEntry = settledClientRouteResolution('/standard/cards', historyRouteKnowledge({ routeKnown: true })!);
assert.equal(clientRouteView(originalCardsEntry, '/standard/cards'), 'known', 'Back must restore a known card route without a remounting pending state');
const original404Entry = settledClientRouteResolution('/missing/path', historyRouteKnowledge({ routeKnown: false })!);
assert.equal(clientRouteView(original404Entry, '/missing/path'), 'not-found', 'Back must restore the original 404 without rendering the home route');

console.log('client route resolution transition assertions passed');
