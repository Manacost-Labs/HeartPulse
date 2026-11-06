import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { launchBrowser } from '../../scripts/lib/browser-launch.mjs';

export async function verifyIdentityContinuation(part = 'all') {
  if (!['all', 'guest', 'context', 'layout'].includes(part)) throw new Error('Unknown identity continuation part');
const root = mkdtempSync(join(tmpdir(), 'reader-identity-continuation-'));
const interaction = 'A'.repeat(24);
const staleInteraction = 'B'.repeat(24);
const unknownInteraction = 'C'.repeat(24);
const brokenInteraction = 'D'.repeat(24);
const hostileInteraction = 'E'.repeat(24);
const lateInteraction = 'F'.repeat(24);
const lateLongInteraction = 'G'.repeat(24);
const lateMissingInteraction = 'H'.repeat(24);
const lateDecoyInteraction = 'I'.repeat(24);
const decoyName = 'hs-manacost.ru Манакост официальный сайт — безопасный вход для читателей и игроков Hearthstone';
// The answer to /client arrives this long after the card is on screen.
const lateAnswerMs = 1000;
let firstFrameReady = Promise.resolve();
let releaseFirstFrame = () => {};
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
  [lateInteraction]: { status: 200, body: { name: 'Манакост', host: 'hs-manacost.ru' }, delay: lateAnswerMs },
  [lateLongInteraction]: { status: 200, body: { name: 'Манакост. Статистика, колоды и разборы Hearthstone для игроков'.repeat(2), host: 'a-very-long-subdomain.partner-site.example.com' }, delay: lateAnswerMs },
  [lateMissingInteraction]: { status: 404, delay: lateAnswerMs },
  // A name that imitates another host, with the real host last: the host must never be the part that is cut.
  [lateDecoyInteraction]: { status: 200, body: { name: decoyName, host: 'evil.example' }, delay: lateAnswerMs },
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
    // Delayed layout fixtures start their one-second delay after the first form frame
    // is sampled; a busy test driver must not consume that observation window.
    const ready = answer.delay ? firstFrameReady : Promise.resolve();
    void ready.then(() => setTimeout(() => {
      response.writeHead(answer.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(answer.body ? JSON.stringify(answer.body) : undefined);
    }, answer.delay ?? 0));
    return;
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

const chromiumPath = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
  .find(candidate => candidate && existsSync(candidate));
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
  // The notice is laid out in rows, so a sentence is compared with its line breaks read as spaces.
  const flatText = async () => (await bodyText()).replace(/\s+/g, ' ');
  const clientRequests = () => httpRequestUrls.filter(url => url.startsWith('/identity/'));
  const lookups = () => clientRequests().filter(url => url.endsWith('/client'));
  const waitForSiteLine = () => page.waitForFunction(line => document.body.innerText.replace(/\s+/g, ' ').includes(line), {}, siteLine);

  if (part === 'all' || part === 'guest') {
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

  }
  if (part === 'all' || part === 'context') {
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
  assert.ok((await flatText()).includes(siteLine), 'registration names the site');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Вход').click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Забыли пароль?').click());
  await page.waitForFunction(() => document.body.innerText.includes('Восстановление пароля'));
  assert.ok((await flatText()).includes(siteLine), 'password recovery names the site');

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

  // A made-up or broken answer leaves the neutral card, without any name, and no script errors.
  for (const uid of [unknownInteraction, brokenInteraction]) {
    await page.goto('about:blank');
    await page.goto(`${origin}/?login#reader_interaction=${uid}`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('h1');
    assert.match(await bodyText(), /Вход в HearthPulse/);
    // The neutral words were already there while the answer was pending; a failed lookup leaves them, and never a name.
    assert.match(await bodyText(), /Вход через hearthpulse\.net\s+Пароль вводится только на hearthpulse\.net/);
    assert.doesNotMatch(await bodyText(), /для сайта/);
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

  }
  if (part === 'all' || part === 'layout') {
  // A late answer must not move the form: the place for the site line is reserved as soon as a handle is known.
  await page.evaluateOnNewDocument(() => {
    // ?storage-denied: session storage refuses every read and write, as in a locked-down browser profile.
    if (location.search.includes('storage-denied')) {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Storage.prototype[method] = () => { throw new DOMException('Storage is denied', 'SecurityError'); };
      }
    }
    window.__early = null;
    window.__shift = 0;
    window.__tops = [];
    window.__named = false;
    window.__observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    });
    window.__observer.observe({ type: 'layout-shift', buffered: true });
    const frame = () => {
      const form = document.querySelector('.login-form');
      if (form) {
        window.__early ??= document.body.innerText;
        window.__tops.push(Math.round(form.getBoundingClientRect().top * 10) / 10);
      }
      if (document.body?.innerText.includes('для сайта')) window.__named = true;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  async function lateAnswer(path, uid, width, query = '') {
    await page.setViewport({ width, height: 844 });
    await page.goto('about:blank');
    firstFrameReady = new Promise(resolve => { releaseFirstFrame = resolve; });
    await page.goto(`${origin}${path}/?login${query}#reader_interaction=${uid}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.login-form');
    await page.waitForFunction(() => window.__early !== null);
    const early = await page.evaluate(() => window.__early);
    releaseFirstFrame();
    await new Promise(resolve => setTimeout(resolve, lateAnswerMs + 500));
    return page.evaluate(() => {
      const records = window.__observer.takeRecords();
      const shift = window.__shift + records.filter(entry => !entry.hadRecentInput).reduce((sum, entry) => sum + entry.value, 0);
      const form = document.querySelector('.login-form').getBoundingClientRect();
      return {
        shift,
        spread: Math.max(...window.__tops) - Math.min(...window.__tops),
        frames: window.__tops.length,
        named: window.__named,
        formBottom: form.bottom,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        cardRight: document.querySelector('.login-card').getBoundingClientRect().right,
        bannerHeight: document.querySelector('.login-site')?.getBoundingClientRect().height ?? null,
        ...(() => {
          const banner = document.querySelector('.login-site');
          const name = banner?.querySelector('.login-site__for');
          const host = banner?.querySelector('.login-site__host');
          const box = banner?.getBoundingClientRect();
          const rects = host ? [...host.getClientRects()] : [];
          // Hit-test both ends of every box of the host: a clipped part is not hit.
          const hit = rects.every(r => [r.left + 1, r.right - 1].every(x => {
            const element = document.elementFromPoint(x, r.top + r.height / 2);
            return Boolean(element && host.contains(element));
          }));
          // The text itself is no wider than the boxes that carry it: nothing is cut inside the host.
          const range = document.createRange();
          if (host) range.selectNodeContents(host);
          const text = host ? range.getBoundingClientRect() : null;
          const textFits = Boolean(text) && text.right <= Math.max(...rects.map(r => r.right)) + 1 && text.left >= Math.min(...rects.map(r => r.left)) - 1;
          return {
            nameClipped: name ? name.scrollWidth > name.clientWidth : null,
            hostText: host ? host.textContent : null,
            hostWhole: rects.length > 0 && hit && textFits
              && rects.every(r => r.left >= box.left && r.right <= box.right + 0.5 && r.top >= box.top && r.bottom <= box.bottom + 0.5 && r.right <= window.innerWidth),
          };
        })(),
      };
    }).then(result => ({ ...result, early }));
  }
  for (const path of ['', '/real']) {
    for (const width of [1280, 390, 320]) {
      const label = `${path || 'card'} at ${width}px`;
      const late = await lateAnswer(path, lateInteraction, width);
      assert.match(late.early, /Вход через hearthpulse\.net\s+Пароль вводится только на hearthpulse\.net/, `${label}: the neutral words are on the first frame`);
      assert.doesNotMatch(late.early, /для сайта/, `${label}: the name is not invented before the answer`);
      assert.ok((await flatText()).includes(siteLine), `${label}: the name arrives in the same line`);
      assert.ok(late.named && late.frames > 20, `${label}: the page was observed across the arrival of the name`);
      assert.ok(late.shift < 0.005, `${label}: layout shift ${late.shift} must stay near zero`);
      assert.ok(late.spread <= 1, `${label}: the form top moved by ${late.spread}px`);
      assert.equal(late.overflow, false, `${label}: no horizontal overflow`);
    }
  }
  // The regular name is shown whole: nothing the card holds back is cut off on narrow screens.
  for (const width of [390, 320]) {
    const regular = await lateAnswer('', lateInteraction, width);
    assert.equal(regular.nameClipped, false, `Манакост at ${width}px: the name is cut`);
    assert.equal(regular.hostText, '(hs-manacost.ru)');
    assert.equal(regular.hostWhole, true, `Манакост at ${width}px: the host is not fully visible`);
  }
  // A very long name is cut (and only the name); the host stays whole, also behind a name that imitates another host.
  for (const width of [390, 320]) {
    for (const [uid, host] of [[lateLongInteraction, 'a-very-long-subdomain.partner-site.example.com'], [lateDecoyInteraction, 'evil.example']]) {
      const long = await lateAnswer('', uid, width);
      assert.ok(long.named, `long name at ${width}px: the name arrived`);
      assert.equal(long.nameClipped, true, `long name at ${width}px: the name is cut to one line`);
      assert.equal(long.hostText, `(${host})`);
      assert.equal(long.hostWhole, true, `${host} at ${width}px: the host must be fully visible`);
      assert.equal(long.overflow, false);
      assert.ok(long.cardRight <= width);
      // The cut name keeps its one row; only a host that itself needs several lines can add lines of its own.
      assert.ok(long.spread <= (host === 'evil.example' ? 1 : 46), `${host} at ${width}px: the form moved by ${long.spread}px`);
    }
  }
  // Session storage that throws changes nothing: the place for the site is held for the whole time, and the name arrives.
  for (const width of [390, 320]) {
    const denied = await lateAnswer('', lateInteraction, width, '&storage-denied');
    assert.match(denied.early, /Вход через hearthpulse\.net\s+Пароль вводится только на hearthpulse\.net/, `storage denied at ${width}px: neutral words on the first frame`);
    assert.ok(denied.named, `storage denied at ${width}px: the name arrived`);
    assert.ok(denied.shift < 0.005 && denied.spread <= 1, `storage denied at ${width}px: the form moved by ${denied.spread}px (shift ${denied.shift})`);
  }
  // A late 404 keeps the neutral words: nothing moves when the lookup fails.
  const missing = await lateAnswer('', lateMissingInteraction, 390);
  assert.match(missing.early, /Вход через hearthpulse\.net\s+Пароль вводится только на hearthpulse\.net/);
  assert.equal(missing.named, false, 'a 404 never names a site');
  assert.ok(missing.shift < 0.005 && missing.spread <= 1, `a late 404 moved the form by ${missing.spread}px (shift ${missing.shift})`);
  }
} finally {
  releaseFirstFrame();
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
}

console.log('reader identity continuation browser contract passed');
}
