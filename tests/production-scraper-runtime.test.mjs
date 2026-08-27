import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = mkdtempSync(join(tmpdir(), 'hearthpulse-production-scraper-'));
const runtime = join(root, 'runtime');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: 'utf8',
    env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', ...options.env },
    timeout: options.timeout ?? 180_000,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function immutableRuntimeInventory() {
  return readdirSync(runtime, { recursive: true })
    .map(entry => String(entry))
    .filter(entry => entry !== 'server/data' && !entry.startsWith('server/data/'))
    .sort();
}

try {
  if (process.env.PRODUCTION_SCRAPER_BUILD_READY !== '1') {
    run('npm', ['run', 'build:server']);
  }

  mkdirSync(join(runtime, 'server', 'data'), { recursive: true });
  cpSync(join(repository, 'package.json'), join(runtime, 'package.json'));
  cpSync(join(repository, 'package-lock.json'), join(runtime, 'package-lock.json'));
  cpSync(join(repository, 'build'), join(runtime, 'build'), { recursive: true });

  run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: runtime });
  const beforeImport = immutableRuntimeInventory();
  run(process.execPath, ['--input-type=module', '-e', "await import('./build/server/scraper.js')"], {
    cwd: runtime,
    env: {
      APP_ROOT_DIR: runtime,
      SERVER_DATA_DIR: join(runtime, 'server', 'data'),
    },
  });
  assert.deepEqual(
    immutableRuntimeInventory(),
    beforeImport,
    'importing the built scraper must not create files outside the shared data directory',
  );
  run(process.execPath, [
    '--input-type=module',
    '-e',
    "const {verifyScraperBrowserRuntime}=await import('./build/server/scraperBrowserRuntime.js'); await verifyScraperBrowserRuntime();",
  ], { cwd: runtime });
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('production scraper runtime smoke passed');
