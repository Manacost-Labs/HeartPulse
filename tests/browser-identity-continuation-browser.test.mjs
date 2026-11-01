import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';

const root = mkdtempSync(join(tmpdir(), 'reader-identity-continuation-'));
const interaction = 'A'.repeat(24);
const staleInteraction = 'B'.repeat(24);
const unknownInteraction = 'C'.repeat(24);
const brokenInteraction = 'D'.repeat(24);
const hostileInteraction = 'E'.repeat(24);
const httpRequestUrls = [];
const entry = join(root, 'entry.tsx');
const bundle = join(root, 'bundle.js');
const wrapper = resolve('src/modules/browserIdentity/ReaderAccountRoute.tsx');
const loginCard = resolve('src/modules/identity/ui/LoginCard.tsx');
const loginStyles = resolve('src/modules/identity/ui/LoginPanel.css');

writeFileSync(entry, `
  import React, { useEffect, useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import ReaderAccountRoute from ${JSON.stringify(wrapper)};
  // ?asuser: already signed in; ?checking: the session check is still running for half a second.
  const flags = new URLSearchParams(location.search);
  function Harness() {
    const [user, setUser] = useState(flags.has('asuser') ? { id: 'reader' } : null);
    const [checking, setChecking] = useState(flags.has('checking'));
    useEffect(() => {
      if (!checking) return undefined;
      const timer = setTimeout(() => setChecking(false), 500);
      return () => clearTimeout(timer);
    }, []);
    return <><button id="login" onClick={() => setUser({ id: 'reader' })}>login</button>
      <ReaderAccountRoute user={user} checking={checking} /></>;
  }
  createRoot(document.getElementById('root')).render(<Harness />);
`);

// The entry lives in a temporary directory, so packages resolve from the checkout.
await build({
  entryPoints: [entry],
  outfile: bundle,
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [resolve('node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
  plugins: [{
    name: 'account-route-ui-stub',
    setup(bundler) {
      bundler.onResolve({ filter: /\/accountRoute\/public$/ }, () => ({ path: 'account-route-ui', namespace: 'stub' }));
      // The real sign-in card with its stylesheet, fed by the wrapper exactly as the lazy account route feeds it.
      bundler.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: `
          import React, { useState } from 'react';
          import LoginCard from ${JSON.stringify(loginCard)};
          import ${JSON.stringify(loginStyles)};
          const noop = () => {};
          export default function AccountRoute({ user, signInFor }) {
            const [mode, setMode] = useState('login');
            if (user) return null;
            return <LoginCard mode={mode} step="password" message={null} loading={false}
              values={{ name: '', country: '', email: '', password: '', code: '', newsletter: false }}
              countries={[]} onChange={noop} onModeChange={setMode} onSubmit={event => event.preventDefault()}
              onEditCredentials={noop} providers={null} signInFor={signInFor} />;
          }`,
        loader: 'jsx',
        resolveDir: resolve('.'),
      }));
    },
  }],
});

// The same page with the real AccountRoute and LoginPanel, so the hand-over of the site to the card is exercised.
await build({
  entryPoints: [entry],
  outfile: join(root, 'real.js'),
  bundle: true,
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [resolve('node_modules')],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
  external: ['/wallpaper/*', '/fonts/*', '/assets/*'],
  logLevel: 'silent',
});
const realScript = readFileSync(join(root, 'real.js'));
const realStyles = readFileSync(join(root, 'real.css'));
const script = readFileSync(bundle);
const styles = readFileSync(join(root, 'bundle.css'));
const clientAnswers = {
  [interaction]: { status: 200, body: { name: 'Манакост', host: 'hs-manacost.ru' } },
  [hostileInteraction]: { status: 200, body: { name: '<img src=x onerror="window.pwned=1">Очень длинное название сайта '.repeat(3), host: `${'a'.repeat(70)}.example.com` } },
  [unknownInteraction]: { status: 404 },
};
const server = createServer((request, response) => {
  httpRequestUrls.push(request.url);
  if (request.url === '/real.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(realScript); return;
  }
  if (request.url === '/real.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' });
    response.end(realStyles); return;
  }
  if (request.url.startsWith('/api/auth/')) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ user: null, adminAllowed: false, contestAdminAllowed: false, enabled: false, mode: 'disabled', socialProviders: [] })); return;
  }
  if (request.url === '/bundle.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(script); return;
  }
  if (request.url === '/bundle.css') {
    response.writeHead(200, { 'Content-Type': 'text/css' });
    response.end(styles); return;
  }
  const client = /^\/identity\/interaction\/([^/]+)\/client$/.exec(request.url);
  if (client) {
    if (client[1] === brokenInteraction) { request.socket.destroy(); return; }
    const answer = clientAnswers[client[1]] ?? { status: 404 };
    response.writeHead(answer.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(answer.body ? JSON.stringify(answer.body) : undefined); return;
  }
  // The consent page answers slowly, so a request the page would still make while leaving is not lost with it.
  const slow = request.url.startsWith('/identity/interaction/') ? 400 : 0;
  const real = request.url.startsWith('/real/');
  setTimeout(() => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(`<!doctype html><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/${real ? 'real' : 'bundle'}.css"><div id="root"></div><script src="/${real ? 'real' : 'bundle'}.js"></script>`);
  }, slow);
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
const browserLaunchOptions = {
  executablePath: chromiumPath,
  headless: true,
  timeout: 60_000,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
};
assert.ok(browserLaunchOptions.args.includes('--disable-dev-shm-usage'),
  'CI browser launch must avoid constrained shared memory');

let browser;
try {
  const port = await listen();
  const origin = `http://127.0.0.1:${port}`;
  browser = await launchBrowser(browserLaunchOptions);
  const page = await browser.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const siteLine = 'Вход через hearthpulse.net для сайта Манакост (hs-manacost.ru)';
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const clientRequests = () => httpRequestUrls.filter(url => url.startsWith('/identity/'));
  const lookups = () => clientRequests().filter(url => url.endsWith('/client'));
  const waitForSiteLine = () => page.waitForFunction(line => document.body.innerText.includes(line), {}, siteLine);

  // An ordinary sign-in names no site and never talks to /identity/.
  await page.goto(`${origin}/?login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  assert.deepEqual(clientRequests(), [], 'a guest without an interaction handle must not request /identity/');
  assert.match(await bodyText(), /Вход в HearthPulse/);
  assert.doesNotMatch(await bodyText(), /Вход через hearthpulse\.net|только на hearthpulse\.net/);

  // A guest arrives from another site: a fresh document, not a hash-only change of this one.
  await page.goto('about:blank');
  const requestsBeforeGuest = httpRequestUrls.length;
  await page.goto(`${origin}/?login#reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login');
  assert.equal(await page.evaluate(() => location.hash), '', 'the browser fragment must be removed after capture');
  assert.equal(await page.evaluate(() => location.search), '?login');
  const remembered = await page.evaluate(() => JSON.parse(sessionStorage.getItem('hp_reader_interaction')));
  assert.equal(remembered.uid, interaction, 'the exact opaque fragment handle must be retained');
  assert.ok(remembered.expiresAt > Date.now() + 590_000 && remembered.expiresAt <= Date.now() + 600_000,
    'stored interaction must have the ten-minute lifetime');
  assert.deepEqual(httpRequestUrls.slice(requestsBeforeGuest).filter(url => url.startsWith('/?login')), ['/?login'],
    'the initial HTTP request must never contain the fragment handle');
  await waitForSiteLine();
  assert.match(await bodyText(), /Пароль вводится только на hearthpulse\.net/);
  assert.match(await bodyText(), /Вход в HearthPulse/, 'the card keeps its own title');
  assert.deepEqual(clientRequests(), [`/identity/interaction/${interaction}/client`],
    'exactly one context request, for the captured handle');
  assert.ok(httpRequestUrls.every(url => !url.includes(interaction) || url.startsWith('/identity/interaction/')),
    'the handle only ever goes to the interaction path');

  // Social-login return carries the remembered handle only in session storage.
  await page.goto(`${origin}/?login`, { waitUntil: 'networkidle0' });
  assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('hp_reader_interaction')).uid), interaction);
  await waitForSiteLine();
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

  // The site stays on the card in registration and password recovery.
  const requestsBefore = clientRequests().length;
  await page.goto(`${origin}/?login&reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  assert.equal(clientRequests().length, requestsBefore, 'a query-only handle must not even be looked up');
  assert.doesNotMatch(await bodyText(), /Вход через hearthpulse\.net/);

  await page.goto('about:blank');
  await page.goto(`${origin}/?login#reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  await waitForSiteLine();
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Регистрация').click());
  await page.waitForFunction(() => document.body.innerText.includes('Регистрация в HearthPulse'));
  assert.ok((await bodyText()).includes(siteLine), 'registration names the site');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Вход').click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Забыли пароль?').click());
  await page.waitForFunction(() => document.body.innerText.includes('Восстановление пароля'));
  assert.ok((await bodyText()).includes(siteLine), 'password recovery names the site');

  // The real account route and sign-in panel carry the site to the card.
  await page.goto('about:blank');
  await page.goto(`${origin}/real/?login#reader_interaction=${interaction}`, { waitUntil: 'networkidle0' });
  await waitForSiteLine();
  assert.match(await bodyText(), /Пароль вводится только на hearthpulse\.net/);
  assert.match(await bodyText(), /Вход в HearthPulse/);
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('about:blank');
  await page.goto(`${origin}/real/?login`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('h1');
  assert.doesNotMatch(await bodyText(), /Вход через hearthpulse\.net/, 'the real card shows no site without a handle');

  // Only a guest is looked up: nothing while the session is still being checked, nothing for someone already signed in.
  await page.goto('about:blank');
  const requestsBeforeChecking = lookups().length;
  await page.goto(`${origin}/?login&checking#reader_interaction=${interaction}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#login');
  await new Promise(resolve => setTimeout(resolve, 250));
  assert.equal(lookups().length, requestsBeforeChecking, 'no lookup while the session check is running');
  await waitForSiteLine();
  assert.equal(lookups().length, requestsBeforeChecking + 1, 'one lookup once the visitor is known to be a guest');

  await page.goto('about:blank');
  const lookupsBeforeSignedIn = lookups().length;
  await page.goto(`${origin}/?login&asuser#reader_interaction=${interaction}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(uid => location.pathname === `/identity/interaction/${uid}`, {}, interaction);
  assert.equal(lookups().length, lookupsBeforeSignedIn, 'a signed-in visitor goes straight to consent without a lookup');

  // A made-up or broken answer leaves the ordinary card and no script errors.
  for (const uid of [unknownInteraction, brokenInteraction]) {
    await page.goto('about:blank');
    await page.goto(`${origin}/?login#reader_interaction=${uid}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('h1');
    assert.match(await bodyText(), /Вход в HearthPulse/);
    assert.doesNotMatch(await bodyText(), /Вход через hearthpulse\.net|только на hearthpulse\.net/);
    assert.ok(clientRequests().includes(`/identity/interaction/${uid}/client`), 'the server was asked, not the URL');
  }
  assert.deepEqual(pageErrors, [], 'no script errors for a missing or failed context');
  assert.deepEqual(consoleErrors.filter(text => !text.startsWith('Failed to load resource')), [],
    'only the browser\'s own network-failure lines, no application console errors');

  // Name and host are text on a 390 px screen, even when hostile or very long.
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('about:blank');
  await page.goto(`${origin}/?login#reader_interaction=${hostileInteraction}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.body.innerText.includes('Пароль вводится только на hearthpulse.net'));
  assert.ok((await bodyText()).includes('<img src=x onerror="window.pwned=1">'), 'markup in the name is shown as text');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.login-card img').length), 0);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    'no horizontal overflow at 390 px');
  assert.equal(await page.evaluate(() => document.querySelector('.login-card').getBoundingClientRect().right <= window.innerWidth), true);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

console.log('reader identity continuation browser contract passed');
