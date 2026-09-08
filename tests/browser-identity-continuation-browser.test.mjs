import assert from 'node:assert/strict';
import { build as viteBuild } from 'vite';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const root = mkdtempSync(join(tmpdir(), 'reader-identity-continuation-'));
const interaction = 'A'.repeat(24);
const staleInteraction = 'B'.repeat(24);
const httpRequestUrls = [];
const entry = join(root, 'entry.tsx');
const bundle = join(root, 'bundle.js');
const wrapper = resolve('src/modules/browserIdentity/ReaderAccountRoute.tsx');

writeFileSync(entry, `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import ReaderAccountRoute from ${JSON.stringify(wrapper)};
  function Harness() {
    const [user, setUser] = useState(null);
    return <><button id="login" onClick={() => setUser({ id: 'reader' })}>login</button>
      <ReaderAccountRoute user={user} /></>;
  }
  createRoot(document.getElementById('root')).render(<Harness />);
`);

await viteBuild({
  configFile: false,
  root: process.cwd(),
  resolve: { alias: {
    react: resolve('node_modules/react'),
    'react-dom': resolve('node_modules/react-dom'),
  } },
  build: {
    outDir: root,
    emptyOutDir: false,
    rollupOptions: { input: entry, output: { format: 'iife', entryFileNames: 'bundle.js' } },
  },
  plugins: [{
    name: 'account-route-ui-stub',
    resolveId(source) {
      return source.endsWith('/accountRoute/public') ? '\0account-route-ui' : null;
    },
    load(id) {
      return id === '\0account-route-ui' ? 'export default function AccountRoute() { return null; }' : null;
    },
  }],
});

const script = readFileSync(bundle);
const server = createServer((request, response) => {
  httpRequestUrls.push(request.url);
  if (request.url === '/bundle.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(script); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const chromiumPath = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .find(existsSync);
assert.ok(chromiumPath, 'Chromium/Chrome executable is required');

let browser;
try {
  const port = await listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await puppeteer.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  await page.goto(`${origin}/?login#reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login');
  assert.equal(await page.evaluate(() => location.hash), '', 'the browser fragment must be removed after capture');
  assert.equal(await page.evaluate(() => location.search), '?login');
  const remembered = await page.evaluate(() => JSON.parse(sessionStorage.getItem('hp_reader_interaction')));
  assert.equal(remembered.uid, interaction, 'the exact opaque fragment handle must be retained');
  assert.ok(remembered.expiresAt > Date.now() + 590_000 && remembered.expiresAt <= Date.now() + 600_000,
    'stored interaction must have the ten-minute lifetime');
  assert.deepEqual(httpRequestUrls.filter(url => url.startsWith('/?login')), ['/?login'],
    'the initial HTTP request must never contain the fragment handle');

  // Social-login return carries the remembered handle only in session storage.
  await page.goto(`${origin}/?login`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('hp_reader_interaction')).uid), interaction);
  await page.click('#login');
  await page.waitForFunction(uid => location.pathname === `/identity/interaction/${uid}`, {}, interaction);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hp_reader_interaction')), null);
  assert.equal(await page.evaluate(() => location.search), '');

  await page.goto(`${origin}/?login&reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hp_reader_interaction')), null,
    'a query-only handle must never be persisted');
  await page.click('#login');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await page.evaluate(() => location.pathname), '/', 'query-only input must not resume an interaction');

  await page.evaluate(({ uid }) => sessionStorage.setItem('hp_reader_interaction', JSON.stringify({ uid, expiresAt: Date.now() - 1 })), { uid: staleInteraction });
  await page.goto(`${origin}/?login`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('hp_reader_interaction')), null, 'expired interaction must be discarded');
  await page.click('#login');
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(await page.evaluate(() => location.pathname), '/', 'expired interaction must not resume');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

console.log('reader identity continuation browser contract passed');
