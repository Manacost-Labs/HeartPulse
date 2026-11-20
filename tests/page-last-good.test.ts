import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// The last good copy of a page is only a fallback: a state directory the
// process cannot write or even list (EACCES) must cost the copy on disk, never
// the render (#648). The loader is `server-only`, so it runs in a child with
// the react-server condition, as Next itself loads it.

const SCRIPT = `
const { loadWithLastGood } = await import('./apps/public-web/lib/pageLastGood.ts');
const parse = raw => (raw && typeof raw === 'object' && typeof raw.open === 'number' ? { open: raw.open } : null);
const fresh = await loadWithLastGood('unwritable', async () => ({ open: 7, paid: 1 }), parse, parse);
const fallback = await loadWithLastGood('unwritable', async () => null, parse, parse);
process.stdout.write('\\nRESULT ' + JSON.stringify({ fresh, fallback }));
`;

test('an unwritable state directory keeps the page rendering from the memory copy', {
  skip: process.getuid?.() === 0 ? 'root ignores directory permissions' : false,
}, () => {
  const root = mkdtempSync(join(tmpdir(), 'page-last-good-'));
  const locked = join(root, 'next-page-last-good-v1');
  mkdirSync(locked);
  chmodSync(locked, 0o000);
  try {
    const output = execFileSync(process.execPath, ['--conditions=react-server', '--import=tsx', '--input-type=module', '-e', SCRIPT], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: '', PAGE_LAST_GOOD_DIR: root },
      encoding: 'utf8',
    });
    const result = output.split('\nRESULT ')[1];
    assert.ok(result, output);
    assert.deepEqual(JSON.parse(result), { fresh: { open: 7 }, fallback: { open: 7 } });
  } finally {
    chmodSync(locked, 0o700);
    rmSync(root, { recursive: true, force: true });
  }
});
