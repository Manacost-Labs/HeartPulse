import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPagePath, createRoutePrefetcher, installClientNavigation, navigate, navigateTab } from '../apps/public-web/ui/navigation';
import { canonicalPagePath } from '../src/app/routing/canonicalPagePath';
import { allowsRoutePrefetch, createRouteIntent } from '../src/shared/navigation/routePrefetch';

function captureNavigation(run: () => void): string[] {
  const visited: string[] = [];
  const previous = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { assign: (path: string) => visited.push(path) } };
  try {
    run();
  } finally {
    (globalThis as { window?: unknown }).window = previous;
  }
  return visited;
}

test('navigate loads the target as a full document', () => {
  assert.deepEqual(captureNavigation(() => navigate('/library/?kind=minions')), ['/library/?kind=minions']);
});

test('navigate requests the canonical trailing-slash URL instead of its redirect', () => {
  assert.deepEqual(captureNavigation(() => {
    navigate('/tierlist');
    navigate('/standard/cards/standard/BE_013?from=meta#stats');
  }), ['/tierlist/', '/standard/cards/standard/BE_013/?from=meta#stats']);
});

test('canonicalPagePath leaves the root, queries, files, APIs and other origins unchanged', () => {
  for (const path of ['/', '/?login', '/faq/', '/library/?kind=minions', '/sitemap.xml',
    '/api/v1/openapi.json', '/api/cards', 'https://boosty.to/kolodahearthstone', '//cdn.hearthpulse.net/a', '#main-content']) {
    assert.equal(canonicalPagePath(path), path);
  }
});

test('navigateTab resolves primary navigation ids to their canonical paths', () => {
  assert.deepEqual(captureNavigation(() => {
    navigateTab('home');
    navigateTab('tierlist');
  }), ['/', '/tierlist/']);
});

test('an unknown navigation id fails loudly instead of doing nothing', () => {
  assert.throws(() => captureNavigation(() => navigateTab('missing')), /Unknown navigation destination: missing/);
});

test('mounted client navigation preserves canonical URLs without loading a document', () => {
  const visited: string[] = [];
  const dispose = installClientNavigation(path => visited.push(path));
  try {
    assert.deepEqual(captureNavigation(() => {
      navigate('/tierlist');
      navigateTab('winrates');
    }), []);
    assert.deepEqual(visited, ['/tierlist/', '/classes/']);
    assert.deepEqual(captureNavigation(() => {
      navigate('/admin/');
      navigate('https://boosty.to/kolodahearthstone');
    }), ['/admin/', 'https://boosty.to/kolodahearthstone']);
  } finally { dispose(); }
  assert.deepEqual(captureNavigation(() => navigate('/faq')), ['/faq/']);
});

test('an obsolete adapter cleanup cannot remove the active router', () => {
  const visited: string[] = [];
  const old = installClientNavigation(() => assert.fail('obsolete adapter'));
  const current = installClientNavigation(path => visited.push(path));
  try {
    old();
    assert.deepEqual(captureNavigation(() => navigate('/faq')), []);
    assert.deepEqual(visited, ['/faq/']);
  } finally { current(); }
});

test('only same-origin public Next pages are eligible for client navigation', () => {
  const base = 'https://hearthpulse.net/classes/';
  for (const path of ['/faq', '/?login', '/standard/cards/standard/BE_013/', '/library/minions/brann-602/']) {
    assert.equal(clientPagePath(path, base), canonicalPagePath(path));
  }
  for (const path of ['/api/cards', '/identity/google', '/admin/', '/r/owner/', '/favicon.ico',
    '/_next/static/a.js', '/health/next/', 'https://boosty.to/kolodahearthstone',
    '//other.example/faq/', 'http://%', 'javascript:alert(1)', '#main-content']) {
    assert.equal(clientPagePath(path, base), null, path);
  }
});

test('repeated route intent reuses its prefetch until Next invalidates it', () => {
  const calls: string[] = [];
  const invalidate = new Map<string, () => void>();
  const prepare = createRoutePrefetcher((path, options) => {
    calls.push(path);
    invalidate.set(path, options.onInvalidate);
  });
  prepare('/faq/');
  prepare('/faq/');
  prepare('/tierlist/');
  assert.deepEqual(calls, ['/faq/', '/tierlist/']);
  invalidate.get('/faq/')?.();
  assert.deepEqual(calls, ['/faq/', '/tierlist/'], 'invalidation must not start background polling');
  prepare('/faq/');
  prepare('/tierlist/');
  assert.deepEqual(calls, ['/faq/', '/tierlist/', '/faq/']);
});

test('failed speculative preparation neither interrupts interaction nor prevents retry', () => {
  let calls = 0;
  const prepare = createRoutePrefetcher(() => { calls += 1; throw new Error('router unavailable'); });
  assert.doesNotThrow(() => prepare('/faq/'));
  assert.doesNotThrow(() => prepare('/faq/'));
  assert.equal(calls, 2);
});

test('fragment variants reuse one preparation and old invalidation cannot clear a replacement', () => {
  const calls: string[] = [];
  const invalidate: Array<() => void> = [];
  const prepare = createRoutePrefetcher((path, options) => {
    calls.push(path);
    invalidate.push(options.onInvalidate);
  }, { capacity: 2 });
  prepare('/faq/#one');
  prepare('/faq/#two');
  assert.deepEqual(calls, ['/faq/']);
  prepare('/terms/');
  prepare('/privacy/');
  prepare('/faq/');
  invalidate[0]();
  prepare('/faq/#three');
  assert.deepEqual(calls, ['/faq/', '/terms/', '/privacy/', '/faq/']);
});

test('intent cancels transient hovers, rechecks network policy and stops on disposal', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  let online = true;
  const intent = createRouteIntent(path => calls.push(path), () => online);
  intent.hover('/faq/');
  context.mock.timers.tick(119);
  intent.cancel();
  context.mock.timers.tick(1);
  assert.deepEqual(calls, []);
  intent.hover('/terms/');
  context.mock.timers.tick(60);
  intent.hover('/terms/');
  context.mock.timers.tick(60);
  assert.deepEqual(calls, ['/terms/'], 'nested pointer events do not postpone genuine intent');
  intent.hover('/privacy/');
  online = false;
  context.mock.timers.tick(120);
  intent.focus('/faq/');
  assert.deepEqual(calls, ['/terms/']);
  online = true;
  intent.focus('/faq/');
  intent.hover('/privacy/');
  intent.dispose();
  context.mock.timers.tick(120);
  intent.focus('/terms/');
  assert.deepEqual(calls, ['/terms/', '/faq/']);
});

test('speculation respects touch, offline, Save-Data and slow connections', () => {
  assert.equal(allowsRoutePrefetch({ online: true }), true);
  assert.equal(allowsRoutePrefetch({ online: true, effectiveType: '4g' }, 'pen'), true);
  for (const connection of [{ online: false }, { online: true, saveData: true },
    { online: true, effectiveType: 'slow-2g' }, { online: true, effectiveType: '2g' }]) {
    assert.equal(allowsRoutePrefetch(connection), false);
  }
  assert.equal(allowsRoutePrefetch({ online: true }, 'touch'), false);
});
