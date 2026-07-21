import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const projectRoot = resolve(import.meta.dirname, '..');
const distDir = mkdtempSync(resolve(tmpdir(), 'manacost-prerender-seo-'));

function readOutput(path) {
  return readFileSync(resolve(distDir, path), 'utf8');
}

function assertNoindexDocument(html, label) {
  assert.match(html, /<meta name="robots" content="noindex, nofollow"/, `${label} robots`);
  assert.doesNotMatch(html, /<link rel="canonical"/i, `${label} must not expose a canonical URL`);
  assert.doesNotMatch(html, /<meta property="og:url"/i, `${label} must not expose og:url`);
  assert.doesNotMatch(html, /application\/ld\+json/i, `${label} must not retain stale structured data`);
  assert.doesNotMatch(html, /\b(?:deckCode|statsAccess|subscriptionPayload)\b/, `${label} must not contain gated payload fields`);
}

try {
  copyFileSync(resolve(projectRoot, 'index.html'), resolve(distDir, 'index.html'));
  writeFileSync(
    resolve(distDir, 'sitemap.xml'),
    '<?xml version="1.0"?><urlset><url><loc>https://arena.hs-manacost.ru/tierlist/</loc><lastmod>2026-01-01</lastmod></url></urlset>',
    'utf8',
  );

  const result = spawnSync(process.execPath, ['scripts/prerender.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PRERENDER_DIST_DIR: distDir,
      PRERENDER_SKIP_REMOTE: '1',
    },
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `prerender failed:\n${result.stdout}\n${result.stderr}`);

  const tierlist = readOutput('tierlist/index.html');
  assert.match(
    tierlist,
    /<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"/,
  );
  assert.match(tierlist, /<link rel="canonical" href="https:\/\/arena\.hs-manacost\.ru\/tierlist\/"/);
  assert.match(tierlist, /<meta property="og:url" content="https:\/\/arena\.hs-manacost\.ru\/tierlist\/"/);

  assertNoindexDocument(readOutput('admin/index.html'), 'admin prerender');
  assertNoindexDocument(readOutput('404.html'), '404 fallback');

  const sitemap = readOutput('sitemap.xml');
  assert.doesNotMatch(sitemap, /\/admin\/?<\/loc>/);
  assert.doesNotMatch(sitemap, /\/404\/?<\/loc>/);
} finally {
  rmSync(distDir, { recursive: true, force: true });
}

console.log('prerender SEO assertions passed');
