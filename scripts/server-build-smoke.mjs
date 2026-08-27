import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = process.cwd();
const expectedStaticSitemapUrlCount = [
  ...readFileSync(join(root, 'dist', 'sitemaps', 'static.xml'), 'utf8').matchAll(/<url>/g),
].length;
const temporaryRoot = mkdtempSync(join(tmpdir(), 'hs-arena-server-smoke-'));
const dataDir = join(temporaryRoot, 'data');
const ecosystemDir = join(temporaryRoot, 'ecosystem');
const port = 32_000 + Math.floor(Math.random() * 2_000);
const now = new Date().toISOString();

mkdirSync(dataDir, { recursive: true });
mkdirSync(ecosystemDir, { recursive: true });
writeFileSync(join(dataDir, 'winrates.json'), JSON.stringify({ updatedAt: now, source: 'smoke', classes: [{}] }));
writeFileSync(join(dataDir, 'tierlist.json'), JSON.stringify({ updatedAt: now, source: 'smoke', sections: [{}] }));
writeFileSync(join(dataDir, 'legendaries.json'), JSON.stringify({ updatedAt: now, source: 'smoke', groups: [{}] }));
writeFileSync(join(temporaryRoot, 'release.json'), JSON.stringify({ sha: 'deadbee' }));
const { ConstructedCardCatalogStore } = await import('../build/server/constructedCardCatalogStore.js');
const catalogStore = new ConstructedCardCatalogStore({ stateDirectory: dataDir });
for (const [format, count] of [['standard', 500], ['wild', 3_000]]) {
  catalogStore.publish(format, Array.from({ length: count }, (_, index) => ({
    card_id: `${format.toUpperCase()}_SMOKE_${index + 1}`,
    dbf: (format === 'standard' ? 100_000 : 200_000) + index,
    name: { ru: `Smoke ${index + 1}` },
    formats: [{ slug: format }],
  })), { expectedTotal: count, sourceUpdatedAt: now });
}

const child = spawn(process.execPath, ['build/server/index.js'], {
  cwd: root,
  env: {
    ...process.env,
    APP_ROOT_DIR: temporaryRoot,
    DISABLE_INITIAL_SCRAPE: '1',
    ECOSYSTEM_DB_FILE: join(ecosystemDir, 'users.sqlite'),
    ECOSYSTEM_DIR: ecosystemDir,
    GITHUB_SHA: '',
    HOST: '127.0.0.1',
    KHA_VIP_PROFILES_FILE: join(temporaryRoot, 'profiles.json'),
    PORT: String(port),
    REDIS_ENABLED: '0',
    RELEASE_SHA: '',
    SERVER_DATA_DIR: dataDir,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });

async function requestJson(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await response.json();
  return { response, body };
}

async function requestText(path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return { response, body: await response.text() };
}

try {
  let live;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`compiled server exited with ${child.exitCode}\n${output}`);
    try {
      live = await requestJson('/health/live');
      break;
    } catch {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 100));
    }
  }
  if (!live) throw new Error(`compiled server did not become live\n${output}`);
  if (live.response.status !== 200 || live.body.status !== 'alive' || live.body.release !== 'deadbee') {
    throw new Error('direct liveness or release-manifest contract failed');
  }

  const proxied = await requestJson('/api/health/live');
  if (proxied.response.status !== 200 || proxied.body.status !== 'alive') throw new Error('proxied liveness contract failed');

  const ready = await requestJson('/health/ready');
  if (ready.response.status !== 200 || ready.body.status !== 'ready') throw new Error(`readiness contract failed: ${JSON.stringify(ready.body)}`);

  const data = await requestJson('/health/data');
  const constructedDatasets = Array.isArray(data.body.datasets)
    ? data.body.datasets.filter(dataset => String(dataset?.name || '').startsWith('constructed-cards-'))
    : [];
  if (data.response.status !== 503
    || data.body.status !== 'degraded'
    || data.body.ready !== true
    || constructedDatasets.length !== 2
    || constructedDatasets.some(dataset => dataset.state !== 'stale' || dataset.cacheSource !== 'LKG')) {
    throw new Error(`data health contract failed: ${JSON.stringify(data.body)}`);
  }

  const legacy = await requestJson('/api/status');
  if (legacy.response.status !== 200 || legacy.body.nextScrape !== 'каждые 6 часов') throw new Error('legacy status contract failed');

  const sitemapIndex = await requestText('/sitemap.xml');
  if (sitemapIndex.response.status !== 200
    || !/^application\/xml/i.test(sitemapIndex.response.headers.get('content-type') || '')
    || !sitemapIndex.body.includes('/sitemaps/static.xml')
    || !sitemapIndex.body.includes('/sitemaps/standard-cards.xml')) {
    throw new Error('runtime sitemap index contract failed');
  }
  const staticSitemap = await requestText('/sitemaps/static.xml');
  if (staticSitemap.response.status !== 200
    || [...staticSitemap.body.matchAll(/<url>/g)].length !== expectedStaticSitemapUrlCount) {
    throw new Error('runtime static sitemap contract failed');
  }

  console.log('compiled server smoke tests passed');
} finally {
  child.kill('SIGTERM');
  const shutdown = await new Promise((resolveClose, rejectClose) => {
    if (child.exitCode !== null) {
      resolveClose({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const deadline = setTimeout(() => {
      child.kill('SIGKILL');
      rejectClose(new Error(`compiled server did not drain after SIGTERM\n${output}`));
    }, 3_000);
    deadline.unref();
    child.once('close', (code, signal) => {
      clearTimeout(deadline);
      resolveClose({ code, signal });
    });
  });
  rmSync(temporaryRoot, { recursive: true, force: true });
  if (shutdown.code !== 0 || shutdown.signal !== null) {
    throw new Error(`compiled server did not exit gracefully: ${JSON.stringify(shutdown)}\n${output}`);
  }
  if (!output.includes('[lifecycle] shutdown complete')) {
    throw new Error(`compiled server omitted graceful shutdown evidence\n${output}`);
  }
}
