import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPagePath, createRoutePrefetcher, installClientNavigation, navigate, navigateTab } from '../apps/public-web/ui/navigation';
import { canonicalPagePath } from '../src/app/routing/canonicalPagePath';
import { observeRouteResponses } from '../apps/public-web/ui/routeResponses';
import { installPageNavigator, openPage } from '../src/shared/navigation/pageNavigation';
import { allowsRoutePrefetch, createRouteIntent } from '../src/shared/navigation/routePrefetch';
import { createViewportPrefetch } from '../src/shared/navigation/viewportPrefetch';

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

test('a press prepares at once, replaces a pending hover and honours the network policy', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  let online = true;
  const intent = createRouteIntent(path => calls.push(path), () => online);
  intent.hover('/faq/');
  context.mock.timers.tick(40);
  intent.press('/terms/');
  assert.deepEqual(calls, ['/terms/'], 'the press does not wait for the hover dwell');
  context.mock.timers.tick(120);
  assert.deepEqual(calls, ['/terms/'], 'the abandoned hover never fires');
  online = false;
  intent.press('/privacy/');
  online = true;
  intent.dispose();
  intent.press('/privacy/');
  assert.deepEqual(calls, ['/terms/']);
});

test('speculation respects offline, Save-Data and slow connections; touch is allowed as a press', () => {
  assert.equal(allowsRoutePrefetch({ online: true }), true);
  assert.equal(allowsRoutePrefetch({ online: true, effectiveType: '4g' }), true);
  for (const connection of [{ online: false }, { online: true, saveData: true },
    { online: true, effectiveType: 'slow-2g' }, { online: true, effectiveType: '2g' }]) {
    assert.equal(allowsRoutePrefetch(connection), false);
  }
});

test('the hover dwell follows the configured motion token', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const calls: string[] = [];
  const intent = createRouteIntent(path => calls.push(path), () => true, { dwellMs: 140 });
  intent.hover('/faq/');
  context.mock.timers.tick(139);
  assert.deepEqual(calls, []);
  context.mock.timers.tick(1);
  assert.deepEqual(calls, ['/faq/']);
});

test('visible links are prepared once each, only while the network allows it', () => {
  let callback: (entries: Array<{ isIntersecting: boolean; target: Element }>) => void = () => {};
  const observed = new Set<Element>();
  const calls: string[] = [];
  let allowed = true;
  const viewport = createViewportPrefetch(path => calls.push(path), () => allowed,
    link => link.getAttribute('href'), next => {
      callback = next;
      return { observe: target => observed.add(target), unobserve: target => observed.delete(target), disconnect: () => observed.clear() };
    });
  const link = (href: string | null) => ({ getAttribute: () => href }) as unknown as HTMLAnchorElement;
  const [menu, other, native, offline] = [link('/tierlist/'), link('/classes/'), link(null), link('/heroes/')];
  viewport.scan([menu, other, native, offline]);
  viewport.scan([menu]);
  assert.equal(observed.size, 4, 'a rescan does not observe a link twice');
  callback([{ isIntersecting: false, target: other }, { isIntersecting: true, target: menu }, { isIntersecting: true, target: native }]);
  allowed = false;
  callback([{ isIntersecting: true, target: offline }]);
  assert.deepEqual(calls, ['/tierlist/']);
  assert.deepEqual([...observed], [other], 'a link stops being observed once it was visible');
  viewport.dispose();
  assert.equal(observed.size, 0);
});

test('complete page responses on their way are joined by path; partial prefetches and other requests are not', async () => {
  const finish: Array<() => void> = [];
  const target = {
    fetch: (() => new Promise<Response>(resolve => finish.push(() => resolve(new Response('payload'))))) as typeof fetch,
  };
  const original = target.fetch;
  (globalThis as { location?: unknown }).location = { href: 'https://hearthpulse.net/faq/' };
  try {
    const responses = observeRouteResponses(target);
    const page = target.fetch('/standard/cards/?_rsc=a', { headers: { RSC: '1' } });
    void target.fetch('/standard/cards/standard/?class=mage&_rsc=d', { headers: { RSC: '1' } });
    void target.fetch('/tierlist/?_rsc=b', { headers: { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Router-Segment-Prefetch': '/_tree' } });
    void target.fetch('/articles/?_rsc=c', { headers: { RSC: '1', 'Next-Router-Prefetch': '1' } });
    void target.fetch('/api/auth/me/');
    assert.equal(responses.pending('/tierlist/'), null, 'the router already joins segment prefetches');
    assert.equal(responses.pending('/articles/'), null, 'a partial prefetch is not the page');
    assert.ok(responses.pending('/standard/cards/standard/?class=mage'), 'the query is part of the page');
    assert.equal(responses.pending('/standard/cards/standard/'), null, 'another query is another page');
    const joined = responses.pending('/standard/cards/');
    assert.ok(joined);
    let settled = false;
    void joined.then(() => { settled = true; });
    finish[0]();
    assert.equal(await (await page).text(), 'payload', 'the router still reads the whole body');
    await joined;
    assert.equal(settled, true);
    assert.equal(responses.pending('/standard/cards/'), null);
    responses.dispose();
    assert.equal(target.fetch, original);
  } finally {
    delete (globalThis as { location?: unknown }).location;
  }
});

test('openPage uses the installed router and falls back to document navigation', () => {
  const routed: string[] = [];
  const dispose = installPageNavigator(path => routed.push(path));
  const stale = installPageNavigator(path => routed.push(`stale ${path}`));
  stale();
  assert.deepEqual(captureNavigation(() => openPage('/?login')), ['/?login'], 'a disposed navigator is gone');
  const again = installPageNavigator(path => routed.push(path));
  openPage('/?login');
  dispose();
  openPage('/tierlist/');
  again();
  assert.deepEqual(routed, ['/?login', '/tierlist/'], 'an older cleanup does not detach the newer navigator');
});
