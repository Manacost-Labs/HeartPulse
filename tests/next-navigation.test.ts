import assert from 'node:assert/strict';
import test from 'node:test';
import { navigate, navigateTab } from '../apps/public-web/ui/navigation';

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

test('navigateTab resolves primary navigation ids to their paths', () => {
  assert.deepEqual(captureNavigation(() => {
    navigateTab('home');
    navigateTab('tierlist');
  }), ['/', '/tierlist']);
});

test('an unknown navigation id fails loudly instead of doing nothing', () => {
  assert.throws(() => captureNavigation(() => navigateTab('missing')), /Unknown navigation destination: missing/);
});
