import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { preferredScrollBehavior, REDUCED_MOTION_QUERY } from '../src/shared/ui/scrollBehavior';

const scope = globalThis as { window?: unknown };

function withWindow(matches: boolean | null, check: () => void) {
  const saved = scope.window;
  scope.window = matches === null ? undefined : {
    matchMedia: (query: string) => ({ matches: query === REDUCED_MOTION_QUERY && matches }),
  };
  try { check(); } finally { scope.window = saved; }
}

test('scripted scrolling jumps for visitors who prefer reduced motion', () => {
  withWindow(true, () => assert.equal(preferredScrollBehavior(), 'auto'));
  withWindow(false, () => assert.equal(preferredScrollBehavior(), 'smooth'));
  withWindow(null, () => assert.equal(preferredScrollBehavior(), 'smooth', 'the server render keeps the default'));
});

// An explicit 'smooth' overrides the stylesheet's reduced-motion rule.
test('no component scrolls smoothly without asking preferredScrollBehavior()', () => {
  const files = execFileSync('git', ['ls-files', 'src/*.tsx', 'src/*.ts', 'apps/*.tsx', 'apps/*.ts'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  const offenders = files.filter(file => /behavior:\s*['"]smooth['"]/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
});
