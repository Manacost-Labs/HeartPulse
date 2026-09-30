import assert from 'node:assert/strict';
import test from 'node:test';
import { navigate, navigateTab } from '../apps/public-web/ui/navigation';
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
