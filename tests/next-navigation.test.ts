import assert from 'node:assert/strict';
import test from 'node:test';
import { clientPagePath, installClientNavigation, navigate, navigateTab } from '../apps/public-web/ui/navigation';
import { canonicalPagePath } from '../src/app/routing/canonicalPagePath';

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
