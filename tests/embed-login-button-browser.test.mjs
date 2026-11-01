import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after, before } from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';

// The widget is served from origin A, the "consumer" page from origin B with a
// strict CSP that only allows the script from A and stylesheets from B itself.
const widgetSource = readFileSync(new URL('../public/embed/hearthpulse-login-v1.js', import.meta.url));
const CONSUMER_START = 'https://consumer.example/reader-auth/start?from=widget';
const SCRIPT_PATH = '/embed/hearthpulse-login-v1.js';
const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(7, 23, 43)';

const PAGE_CSS = `
  body { margin: 0; padding: 24px; background: #fff; color: #333; font: 16px/1.4 Georgia, serif; }
  a { color: rgb(200, 0, 0); font-size: 30px; letter-spacing: 5px; text-transform: uppercase; }
  span { color: rgb(0, 128, 0) !important; display: inline !important; }
  hearthpulse-login-button { font: italic 700 28px/3 serif; color: rgb(255, 0, 255);
    letter-spacing: 6px; text-transform: uppercase; word-spacing: 20px; }
  .zone { padding: 24px; margin-bottom: 16px; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; }
  .zone-dark { background: #000; }
  .zone-light { background: #fff; }
  #narrow { width: 180px; border: 1px dashed #999; }
`;

const FALLBACK = '<a id="fallback" href="/start">Войти через HearthPulse (hearthpulse.net)</a>';
const BUTTON = `<hearthpulse-login-button id="login" href="/start">${FALLBACK}</hearthpulse-login-button>`;

let widgetServer;
let hostServer;
let widgetOrigin;
let hostOrigin;
let browser;
let shotsDir;
let ownsShotsDir = false;
const widgetRequests = [];
const hostRequests = [];

function pageHtml(body, withScript = true) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Consumer</title>
<link rel="stylesheet" href="/page.css">${withScript ? `<script src="${widgetOrigin}${SCRIPT_PATH}" defer></script>` : ''}
</head><body><p id="copy">Consumer page</p><a id="outer" href="/other">Outer link</a>${body}</body></html>`;
}

function galleryBody() {
  return `<div class="zone zone-light">
    <hearthpulse-login-button id="g-light" theme="light" href="/start"></hearthpulse-login-button>
    <hearthpulse-login-button theme="light" lang="en" href="https://consumer.example/start"></hearthpulse-login-button>
    <hearthpulse-login-button theme="light" href="javascript:alert(1)"></hearthpulse-login-button>
  </div>
  <div class="zone zone-dark">
    <hearthpulse-login-button id="g-dark" theme="dark" href="/start"></hearthpulse-login-button>
    <hearthpulse-login-button theme="dark" lang="en" href="/start"></hearthpulse-login-button>
    <hearthpulse-login-button theme="dark" href="http://insecure.example/"></hearthpulse-login-button>
  </div>
  <div class="zone zone-light"><div id="narrow"><hearthpulse-login-button href="/start"></hearthpulse-login-button></div></div>`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

function closeServer(server) {
  return new Promise(resolve => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
}

before(async () => {
  widgetServer = createServer((request, response) => {
    widgetRequests.push(request.url);
    if (request.url === SCRIPT_PATH) {
      response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
      response.end(widgetSource);
      return;
    }
    response.writeHead(404).end();
  });
  widgetOrigin = await listen(widgetServer);

  hostServer = createServer((request, response) => {
    hostRequests.push(request.url);
    const csp = `default-src 'none'; script-src ${widgetOrigin}; style-src 'self'`;
    const send = (type, body) => response.writeHead(200, {
      'Content-Type': type, 'Content-Security-Policy': csp, 'Cache-Control': 'no-store',
    }).end(body);
    if (request.url === '/page.css') return send('text/css', PAGE_CSS);
    if (request.url === '/') return send('text/html; charset=utf-8', pageHtml(BUTTON));
    if (request.url === '/plain') return send('text/html; charset=utf-8', pageHtml('', false));
    if (request.url === '/nojs') return send('text/html; charset=utf-8', pageHtml(BUTTON, false));
    if (request.url === '/empty') return send('text/html; charset=utf-8', pageHtml(''));
    if (request.url === '/gallery') return send('text/html; charset=utf-8', pageHtml(galleryBody()));
    if (request.url === '/start') return send('text/html; charset=utf-8', '<!doctype html><title>start</title><p>start</p>');
    response.writeHead(404).end();
    return undefined;
  });
  hostOrigin = await listen(hostServer);

  shotsDir = process.env.HP_LOGIN_BUTTON_SHOTS_DIR;
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });
  else { shotsDir = mkdtempSync(join(tmpdir(), 'hp-login-button-')); ownsShotsDir = true; }

  const executablePath = ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable']
    .find(existsSync);
  assert.ok(executablePath, 'Chromium/Chrome executable is required');
  browser = await launchBrowser({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
});

after(async () => {
  await browser?.close();
  await closeServer(widgetServer);
  await closeServer(hostServer);
  if (ownsShotsDir) rmSync(shotsDir, { recursive: true, force: true });
});

/** A page whose console, errors, dialogs and requests are recorded; the consumer host is faked. */
async function openPage(path, { width = 1440, height = 900, scheme = 'light' } = {}) {
  const page = await browser.newPage();
  const seen = { warnings: [], errors: [], dialogs: [], requests: [] };
  page.on('console', message => {
    if (message.type() === 'warn') seen.warnings.push(message.text());
    if (message.type() === 'error') seen.errors.push(message.text());
  });
  page.on('pageerror', error => seen.errors.push(String(error)));
  page.on('dialog', async dialog => { seen.dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith('https://consumer.example/')) {
      request.respond({ status: 200, contentType: 'text/html', body: '<!doctype html><title>consumer</title>' });
      return;
    }
    if (!url.endsWith('/favicon.ico')) seen.requests.push(url);
    request.continue();
  });
  await page.setViewport({ width, height });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(`${hostOrigin}${path}`, { waitUntil: 'networkidle0' });
  return { page, seen };
}

function button(page, selector = '#login') {
  return page.evaluate(selectorValue => {
    const host = document.querySelector(selectorValue);
    const link = host.shadowRoot.querySelector('a');
    const style = getComputedStyle(link);
    const title = getComputedStyle(link.querySelector('.m'));
    const caption = getComputedStyle(link.querySelector('.s'));
    const box = link.getBoundingClientRect();
    return {
      text: link.textContent,
      href: link.getAttribute('href'),
      role: link.getAttribute('role'),
      disabled: link.getAttribute('aria-disabled'),
      lang: link.getAttribute('lang'),
      background: style.backgroundColor,
      titleColor: title.color,
      captionColor: caption.color,
      height: box.height,
      width: box.width,
      overflowX: link.scrollWidth > link.clientWidth,
      hasSvg: link.querySelector('svg[aria-hidden="true"]') !== null,
    };
  }, selector);
}

function findLink(node) {
  if (!node) return null;
  if (node.role === 'link' && /hearthpulse\.net/.test(node.name ?? '')) return node;
  for (const child of node.children ?? []) {
    const found = findLink(child);
    if (found) return found;
  }
  return null;
}

async function center(page, selector) {
  const box = await (await page.$(selector)).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const settle = page => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)));

test('button renders styled under a strict consumer CSP and exposes a named link', async () => {
  const { page, seen } = await openPage('/');
  try {
    const state = await button(page);
    assert.equal(state.text, 'Войти через HearthPulsehearthpulse.net');
    assert.equal(state.href, '/start');
    assert.equal(state.lang, 'ru');
    assert.equal(state.hasSvg, true);
    assert.equal(state.background, LIGHT_BG);
    assert.ok(state.height >= 44, `touch target height ${state.height}`);
    assert.ok(state.width >= 44, `touch target width ${state.width}`);

    const tree = await page.accessibility.snapshot({ interestingOnly: true });
    const link = findLink(tree);
    assert.ok(link, 'the accessibility tree must expose a link that names hearthpulse.net');
    assert.equal(link.name, 'Войти через HearthPulse hearthpulse.net');

    // The light-DOM fallback link is replaced, not shown twice.
    const fallbackBox = await page.$eval('#fallback', element => element.getBoundingClientRect().width);
    assert.equal(fallbackBox, 0);
    assert.deepEqual(seen.errors, [], 'no CSP violations or script errors');
    assert.deepEqual(seen.warnings, []);
    await settle(page);
  } finally { await page.close(); }
});

test('without the script the light-DOM fallback link is visible and works', async () => {
  const { page } = await openPage('/nojs');
  try {
    const box = await page.$eval('#fallback', element => element.getBoundingClientRect().width);
    assert.ok(box > 0, 'fallback link must be rendered before the element is defined');
    await Promise.all([page.waitForNavigation(), page.click('#fallback')]);
    assert.equal(page.url(), `${hostOrigin}/start`);
  } finally { await page.close(); }
});

test('click and Enter navigate the same window to href; no popup is opened', async () => {
  const { page, seen } = await openPage('/');
  try {
    const point = await center(page, '#login');
    await Promise.all([page.waitForNavigation(), page.mouse.click(point.x, point.y)]);
    assert.equal(page.url(), `${hostOrigin}/start`);

    await page.goto(`${hostOrigin}/`, { waitUntil: 'networkidle0' });
    await page.keyboard.press('Tab'); // first Tab stop is the page's own "Outer link"
    assert.equal(await page.evaluate(() => document.activeElement.id), 'outer');
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const link = document.activeElement.shadowRoot.activeElement;
      const style = getComputedStyle(link);
      return { host: document.activeElement.id, tag: link.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    assert.deepEqual(focus, { host: 'login', tag: 'A', outlineStyle: 'solid', outlineWidth: '3px' });
    await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);
    assert.equal(page.url(), `${hostOrigin}/start`);
    assert.equal((await browser.pages()).filter(candidate => candidate.url().includes('/start')).length, 1);

    // An absolute https href reaches exactly that URL, query string included.
    await page.goto(`${hostOrigin}/empty`, { waitUntil: 'networkidle0' });
    await page.evaluate(href => {
      const element = document.createElement('hearthpulse-login-button');
      element.id = 'absolute';
      element.setAttribute('href', href);
      document.body.append(element);
    }, CONSUMER_START);
    const absolutePoint = await (async () => { await settle(page); return center(page, '#absolute'); })();
    await Promise.all([page.waitForNavigation(), page.mouse.click(absolutePoint.x, absolutePoint.y)]);
    assert.equal(page.url(), CONSUMER_START);
    assert.deepEqual(seen.dialogs, []);
  } finally { await page.close(); }
});

test('unsafe or malformed href disables the button: no navigation, one warning', async () => {
  const bad = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' \tjavascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://insecure.example/start',
    '//evil.example/start',
    '/\\evil.example/start',
    '/\t/evil.example/start',
    'https://user:secret@consumer.example/start',
    'https:consumer.example/start',
    'start',
    '',
  ];
  const { page, seen } = await openPage('/empty');
  try {
    const before = seen.requests.length;
    for (const [index, href] of bad.entries()) {
      await page.evaluate((value, id) => {
        const element = document.createElement('hearthpulse-login-button');
        element.id = id;
        element.setAttribute('href', value);
        document.body.append(element);
      }, href, `bad-${index}`);
      await settle(page);
      assert.equal(seen.warnings.length, index + 1, `one warning for ${JSON.stringify(href)}`);
      const state = await button(page, `#bad-${index}`);
      assert.equal(state.href, null, `${JSON.stringify(href)} must not reach an href`);
      assert.equal(state.role, 'link');
      assert.equal(state.disabled, 'true');
      const point = await center(page, `#bad-${index}`);
      await page.mouse.click(point.x, point.y);
      await settle(page);
      assert.equal(page.url(), `${hostOrigin}/empty`, `${JSON.stringify(href)} must not navigate`);
    }
    // A host without any href is disabled too; a later language change does not warn again.
    await page.evaluate(() => {
      const element = document.createElement('hearthpulse-login-button');
      element.id = 'no-href';
      document.body.append(element);
    });
    await settle(page);
    assert.equal(seen.warnings.length, bad.length + 1);
    await page.$eval('#no-href', element => element.setAttribute('lang', 'en'));
    await settle(page);
    assert.equal(seen.warnings.length, bad.length + 1);
    assert.equal((await button(page, '#no-href')).text, 'Sign in with HearthPulsehearthpulse.net');

    assert.deepEqual(seen.dialogs, []);
    assert.deepEqual(seen.errors, []);
    assert.equal(seen.requests.length, before, 'bad hrefs must not cause any request');
    // No stray javascript:/data:/http: value anywhere in any shadow tree.
    const markup = await page.evaluate(() => [...document.querySelectorAll('hearthpulse-login-button')]
      .map(host => host.shadowRoot.innerHTML).join('\n'));
    assert.ok(!markup.includes('javascript:') && !markup.includes('data:text') && !markup.includes('http://insecure'));
  } finally { await page.close(); }
});

test('changing href at runtime re-validates the link', async () => {
  const { page, seen } = await openPage('/');
  try {
    await page.$eval('#login', element => element.setAttribute('href', 'javascript:alert(1)'));
    await settle(page);
    assert.equal((await button(page)).href, null);
    assert.equal(seen.warnings.length, 1);
    await page.$eval('#login', element => element.setAttribute('href', 'https://consumer.example/a?b=1&c=2'));
    await settle(page);
    const state = await button(page);
    assert.equal(state.href, 'https://consumer.example/a?b=1&c=2');
    assert.equal(state.disabled, null);
    assert.equal(seen.warnings.length, 1);
  } finally { await page.close(); }
});

test('theme attribute and prefers-color-scheme choose light or dark; language falls back to ru', async () => {
  const cases = [
    { theme: null, scheme: 'light', background: LIGHT_BG },
    { theme: null, scheme: 'dark', background: DARK_BG },
    { theme: 'auto', scheme: 'dark', background: DARK_BG },
    { theme: 'light', scheme: 'dark', background: LIGHT_BG },
    { theme: 'dark', scheme: 'light', background: DARK_BG },
    { theme: 'unknown', scheme: 'dark', background: DARK_BG },
    { theme: 'unknown', scheme: 'light', background: LIGHT_BG },
  ];
  for (const { theme, scheme, background } of cases) {
    const { page } = await openPage('/', { scheme });
    try {
      if (theme) await page.$eval('#login', (element, value) => element.setAttribute('theme', value), theme);
      await settle(page); // let the 150 ms colour transition finish
      const state = await button(page);
      assert.equal(state.background, background, `theme=${theme} scheme=${scheme}`);
      const dark = background === DARK_BG;
      assert.equal(state.titleColor, dark ? 'rgb(248, 251, 255)' : 'rgb(7, 23, 43)');
      assert.equal(state.captionColor, dark ? 'rgb(147, 197, 253)' : 'rgb(47, 90, 138)');
    } finally { await page.close(); }
  }
  const { page } = await openPage('/');
  try {
    for (const [lang, text] of [['en', 'Sign in with HearthPulsehearthpulse.net'], ['EN-us', 'Sign in with HearthPulsehearthpulse.net'],
      ['de', 'Войти через HearthPulsehearthpulse.net'], ['ru', 'Войти через HearthPulsehearthpulse.net']]) {
      await page.$eval('#login', (element, value) => element.setAttribute('lang', value), lang);
      await settle(page);
      assert.equal((await button(page)).text, text, `lang=${lang}`);
    }
  } finally { await page.close(); }
});

test('forced-colors mode uses system colours and keeps a visible border', async () => {
  const { page } = await openPage('/');
  try {
    await page.emulateMediaFeatures([{ name: 'forced-colors', value: 'active' }]);
    const state = await page.$eval('#login', element => {
      const style = getComputedStyle(element.shadowRoot.querySelector('a'));
      return { border: style.borderTopStyle, borderWidth: style.borderTopWidth };
    });
    assert.equal(state.border, 'solid');
    assert.equal(state.borderWidth, '1px');
  } finally { await page.close(); }
});

test('reduced motion removes the colour transition', async () => {
  const { page } = await openPage('/');
  try {
    assert.equal(await page.$eval('#login', element => getComputedStyle(element.shadowRoot.querySelector('a')).transitionDuration), '0.15s, 0.15s');
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.$eval('#login', element => getComputedStyle(element.shadowRoot.querySelector('a')).transitionDuration), '0s');
  } finally { await page.close(); }
});

test('loading the script twice is harmless', async () => {
  const { page, seen } = await openPage('/');
  try {
    await page.evaluate(src => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('second load failed'));
      document.head.append(script);
    }), `${widgetOrigin}${SCRIPT_PATH}`);
    await settle(page);
    assert.deepEqual(seen.errors, []);
    assert.deepEqual(seen.warnings, []);
    assert.equal((await button(page)).background, LIGHT_BG);
    const point = await center(page, '#login');
    await Promise.all([page.waitForNavigation(), page.mouse.click(point.x, point.y)]);
    assert.equal(page.url(), `${hostOrigin}/start`);
  } finally { await page.close(); }
});

test('the host page styles do not reach the button and the button leaks nothing into the page', async () => {
  const plain = await openPage('/plain');
  const withWidget = await openPage('/');
  try {
    const globalsOf = page => page.evaluate(() => Object.getOwnPropertyNames(window).sort());
    const added = await withWidget.page.evaluate(async baseline => {
      const names = new Set(baseline);
      return Object.getOwnPropertyNames(window).filter(name => !names.has(name));
    }, await globalsOf(plain.page));
    assert.deepEqual(added, [], 'no global variables besides the custom element');

    // Hostile page rules (a, span, the host tag itself) must not change the widget...
    const inner = await withWidget.page.$eval('#login', element => {
      const link = element.shadowRoot.querySelector('a');
      const style = getComputedStyle(link);
      const title = getComputedStyle(link.querySelector('.m'));
      return {
        fontSize: style.fontSize, fontStyle: style.fontStyle, fontWeight: style.fontWeight,
        letterSpacing: style.letterSpacing, textTransform: style.textTransform, wordSpacing: style.wordSpacing,
        titleColor: title.color, titleDisplay: title.display, titleSize: title.fontSize, titleLineHeight: title.lineHeight,
        titleTransform: title.textTransform, titleSpacing: title.letterSpacing,
      };
    });
    assert.deepEqual(inner, {
      fontSize: '15px', fontStyle: 'normal', fontWeight: '600', letterSpacing: 'normal', textTransform: 'none',
      wordSpacing: '0px', titleColor: 'rgb(7, 23, 43)', titleDisplay: 'block', titleSize: '15px',
      titleLineHeight: '18px', titleTransform: 'none', titleSpacing: 'normal',
    });

    // ...and the widget must not change the page's own elements, styles or head.
    const outside = page => page.evaluate(() => {
      const link = getComputedStyle(document.getElementById('outer'));
      const copy = getComputedStyle(document.getElementById('copy'));
      return {
        linkColor: link.color, linkSize: link.fontSize, copyColor: copy.color, copySize: copy.fontSize,
        sheets: document.styleSheets.length, adopted: document.adoptedStyleSheets.length,
        styleTags: document.querySelectorAll('style, link[rel=stylesheet]').length,
        headChildren: [...document.head.children].map(child => child.tagName),
      };
    });
    const [before, after] = [await outside(plain.page), await outside(withWidget.page)];
    assert.equal(after.linkColor, 'rgb(200, 0, 0)');
    assert.equal(after.linkSize, '30px');
    assert.equal(after.copyColor, 'rgb(51, 51, 51)');
    assert.equal(after.sheets, 1);
    assert.equal(after.adopted, 0);
    assert.equal(after.styleTags, 1);
    assert.deepEqual({ ...after, headChildren: undefined }, { ...before, headChildren: undefined });
    assert.deepEqual(after.headChildren, [...before.headChildren, 'SCRIPT']);
  } finally { await plain.page.close(); await withWidget.page.close(); }
});

test('the widget makes no requests besides its script and touches no cookies or storage', async () => {
  widgetRequests.length = 0;
  const { page, seen } = await openPage('/');
  try {
    assert.deepEqual(seen.requests, [`${hostOrigin}/`, `${hostOrigin}/page.css`, `${widgetOrigin}${SCRIPT_PATH}`]);
    assert.deepEqual(widgetRequests, [SCRIPT_PATH]);
    const stored = await page.evaluate(async () => ({
      cookie: document.cookie, local: localStorage.length, session: sessionStorage.length,
      databases: (await indexedDB.databases()).length, caches: (await caches.keys()).length,
      entries: performance.getEntriesByType('resource').map(entry => entry.name),
    }));
    assert.equal(stored.cookie, '');
    assert.equal(stored.local, 0);
    assert.equal(stored.session, 0);
    assert.equal(stored.databases, 0);
    assert.equal(stored.caches, 0);
    assert.deepEqual(stored.entries, [`${hostOrigin}/page.css`, `${widgetOrigin}${SCRIPT_PATH}`]);
    assert.deepEqual(await page.cookies(), []);
  } finally { await page.close(); }
});

test('narrow containers wrap the label instead of overflowing; screenshots at 390 and 1440', async () => {
  for (const width of [390, 1440]) {
    for (const scheme of ['light', 'dark']) {
      const { page, seen } = await openPage('/gallery', { width, height: 700, scheme });
      try {
        const layout = await page.evaluate(() => ({
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth,
          narrow: [...document.querySelectorAll('#narrow hearthpulse-login-button')].map(host => {
            const link = host.shadowRoot.querySelector('a');
            const box = link.getBoundingClientRect();
            return { overflow: link.scrollWidth > link.clientWidth, width: box.width };
          }),
        }));
        assert.equal(layout.pageOverflow, false, `${width}px: no horizontal page scroll`);
        assert.equal(layout.narrow[0].overflow, false);
        assert.ok(layout.narrow[0].width <= 180, `narrow container width ${layout.narrow[0].width}`);
        assert.equal(seen.warnings.length, 2, 'the two deliberately bad hrefs in the gallery warn once each');
        assert.deepEqual(seen.errors, []);

        // Keyboard focus ring for the screenshot.
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        const file = join(shotsDir, `login-button-${width}-${scheme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        assert.ok(statSync(file).size > 1000, `${file} was written`);
      } finally { await page.close(); }
    }
  }
});
