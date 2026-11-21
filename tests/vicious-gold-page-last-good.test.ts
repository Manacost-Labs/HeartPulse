import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { OPEN_FRAME } from './fixtures/viciousGoldSentinels.mjs';

// A regeneration of /standard/vicious-gold/ while vS is down (#677): Express answers a prerender 503 (it never hands
// out a stale frame there), so the page renders the last frame it accepted instead of throwing; only with no frame
// at all it throws, so Next keeps its earlier copy. An outage costs one warning of the page, not one per regeneration. The loader is `server-only`: it runs in a child with the
// react-server condition, as Next loads it; each child is a fresh Next process.

const run = promisify(execFile);

const SCRIPT = `
const { loadPublicViciousGoldPage } = await import('./apps/public-web/lib/publicViciousGold.ts');
const logged = { error: 0, warn: 0 };
console.error = () => { logged.error += 1; };
console.warn = () => { logged.warn += 1; };
const pages = [];
for (let attempt = 0; attempt < Number(process.env.ATTEMPTS); attempt += 1) {
  try {
    const frame = await loadPublicViciousGoldPage();
    pages.push(frame ? JSON.stringify(frame) === process.env.EXPECTED ? 'frame' : 'other' : 'empty');
  } catch {
    pages.push('threw');
  }
}
process.stdout.write('\\nRESULT ' + JSON.stringify({ pages, logged }));
`;

test('a regeneration while vS is down renders the last good frame, after a restart too, with one warning', async () => {
  let goodAnswers = 0;
  const prerenderReads: string[] = [];
  const express = createServer((request, response) => {
    prerenderReads.push(String(request.headers['x-hearthpulse-prerender']));
    if (goodAnswers > 0) {
      goodAnswers -= 1;
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(OPEN_FRAME));
      return;
    }
    response.writeHead(503, { 'content-type': 'application/json', 'retry-after': '60' }).end('{"error":"down"}');
  });
  await new Promise<void>(resolve => express.listen(0, '127.0.0.1', resolve));
  const address = express.address();
  assert.ok(address && typeof address === 'object');
  const stateDirectory = await mkdtemp(join(tmpdir(), 'vicious-gold-page-'));
  const emptyDirectory = await mkdtemp(join(tmpdir(), 'vicious-gold-page-'));
  const regenerate = async (directory: string, attempts: number) => {
    const { stdout } = await run(process.execPath, ['--conditions=react-server', '--import=tsx', '--input-type=module', '-e', SCRIPT], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_OPTIONS: '', NEXT_PHASE: '', PAGE_LAST_GOOD_DIR: directory, ATTEMPTS: String(attempts),
        EXPECTED: JSON.stringify(OPEN_FRAME), LEGACY_WEB_ORIGIN: `http://127.0.0.1:${address.port}` },
      encoding: 'utf8',
    });
    const result = stdout.split('\nRESULT ')[1];
    assert.ok(result, stdout);
    return JSON.parse(result);
  };
  try {
    goodAnswers = 1;
    assert.deepEqual(await regenerate(stateDirectory, 3), { pages: ['frame', 'frame', 'frame'], logged: { error: 0, warn: 1 } },
      'vS goes down after the first regeneration: the page keeps its frame');
    assert.deepEqual(await regenerate(stateDirectory, 2), { pages: ['frame', 'frame'], logged: { error: 0, warn: 1 } },
      'a restarted Next renders the frame kept on disk');
    assert.deepEqual(await regenerate(emptyDirectory, 2), { pages: ['threw', 'threw'], logged: { error: 0, warn: 1 } },
      'with no frame kept the regeneration throws (Next keeps its earlier copy), still one warning');
    assert.deepEqual([...new Set(prerenderReads)], ['1'], 'every read is a prerender read: Express never answers it with a stale frame');
  } finally {
    await new Promise<void>(resolve => express.close(() => resolve()));
    await rm(stateDirectory, { recursive: true, force: true });
    await rm(emptyDirectory, { recursive: true, force: true });
  }
});
