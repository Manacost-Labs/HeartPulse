import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { registeredInlineScriptHashes } from '../apps/public-web/contentSecurityPolicy.mjs';
import { isFrameworkScript, startCspEnforcingProxy } from './helpers/cspEnforcingProxy.mjs';

// The pages of #686: home, meta, an archetype, a card, Vicious Syndicate Gold,
// fun decks (with a kept deck view) and the Battlegrounds tier list.
const PAGES = ['/', '/standard/meta/', '/standard/archetypes/standard/qa-evenlock/', '/standard/cards/standard/CARD_QA_1/',
  '/standard/vicious-gold/', '/standard/fun-decks/', '/battlegrounds/tier-list/'];
const VIEWER_TAG = 'QaViewerSessionTag0001';

let runtime;
let proxy;
let browser;
let dropped = null;
let planted = '';

before(async () => {
  runtime = await startQaNextRuntime();
  proxy = await startCspEnforcingProxy(runtime.origin, { policyHashes: () => Object.entries(registeredInlineScriptHashes())
    .filter(([id]) => id !== dropped).map(([, hash]) => hash), rewriteHtml: html => html.replace('</body>', `${planted}</body>`) });
  browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  await proxy?.close();
  await runtime?.close();
});

/**
 * Before any script: the remembered compact menu, the kept "rows" deck view
 * and a remembered viewer of this session, so each head script has something
 * to mark; then every mark they put on `<html>` and every CSP violation is kept.
 */
function rememberAndWatch(tag) {
  localStorage.setItem('hp:nav:compact', '1');
  localStorage.setItem('hp:deck-layout', 'rows');
  localStorage.setItem('hs_arena_viewer_hint', JSON.stringify({ v: 1, tag, exp: Date.now() + 3_600_000, viewer: 'qa-viewer' }));
  localStorage.setItem('hs_arena_verified_viewer', 'qa-viewer');
  window.__violations = [];
  window.__marks = {};
  document.addEventListener('securitypolicyviolation', event => window.__violations.push(
    { directive: event.effectiveDirective, blocked: event.blockedURI, sample: event.sample }));
  new MutationObserver(records => {
    for (const record of records) {
      if (record.target !== document.documentElement) continue;
      const value = document.documentElement.getAttribute(record.attributeName);
      if (value !== null) window.__marks[record.attributeName] = value;
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-hp-viewer', 'data-nav-compact', 'data-deck-layout-restore'] });
}

async function open(path) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const consoleReports = [];
  page.on('console', message => { if (/Content.Security.Policy/i.test(message.text())) consoleReports.push(message.text()); });
  await page.setCookie({ name: 'hp_viewer', value: VIEWER_TAG, url: proxy.origin });
  await page.evaluateOnNewDocument(rememberAndWatch, VIEWER_TAG);
  const response = await page.goto(`${proxy.origin}${path}`, { waitUntil: 'networkidle0', timeout: 60_000 });
  return { page, context, response, consoleReports };
}

test('every key page runs its inline scripts and hydrates under an enforcing CSP', { timeout: 240_000 }, async () => {
  for (const path of PAGES) {
    const { page, context, response, consoleReports } = await open(path);
    try {
      assert.equal(response.status(), 200, `${path}: status`);
      assert.match(response.headers()['content-security-policy'], /^script-src 'self' 'sha256-/, `${path}: the policy is enforced`);
      // The compact rail's toggle answers a click only once React has hydrated the page.
      await page.click('button[aria-label="Развернуть меню"]');
      await page.waitForSelector('button[aria-label="Свернуть меню"][aria-pressed="false"]', { timeout: 10_000 });
      const state = await page.evaluate(() => ({ violations: window.__violations, marks: window.__marks,
        config: window.__ARENA_RUNTIME_CONFIG__ }));
      assert.deepEqual(state.violations, [], `${path}: no CSP violations`);
      assert.deepEqual(consoleReports, [], `${path}: no CSP messages in the console`);
      assert.equal(state.marks['data-hp-viewer'], 'remembered', `${path}: the session check marked the remembered viewer`);
      assert.equal(state.marks['data-nav-compact'], '', `${path}: the remembered compact menu was applied`);
      if (path === '/standard/fun-decks/') assert.equal(state.marks['data-deck-layout-restore'], 'rows', `${path}: the kept deck view was marked`);
      assert.deepEqual(state.config, { cardImageCdn: { enabled: false, origin: 'https://cdn.hearthpulse.net' }, webVitals: { enabled: false } },
        `${path}: the runtime switches reached the page`);
    } finally {
      await context.close();
    }
  }
});

// Without its hash a script is blocked, reported once, and its effect is missing:
// this is what the test above would see if a registered script lost its hash.
for (const [id, path, missing] of [
  ['navigation', '/', state => state.marks['data-nav-compact'] === undefined],
  ['authPrefetch', '/', state => state.marks['data-hp-viewer'] === undefined],
  ['runtimeConfig', '/', state => state.config === undefined],
  ['analytics', '/', () => true],
  ['deckLayoutRestore', '/standard/fun-decks/', state => state.marks['data-deck-layout-restore'] === undefined],
]) {
  test(`the policy blocks the ${id} script once its hash is missing`, { timeout: 90_000 }, async () => {
    dropped = id;
    const { page, context } = await open(path);
    try {
      const state = await page.evaluate(() => ({ violations: window.__violations, marks: window.__marks,
        config: window.__ARENA_RUNTIME_CONFIG__ }));
      assert.deepEqual(state.violations.map(violation => [violation.directive, violation.blocked]), [['script-src-elem', 'inline']],
        `${id}: exactly one inline script is blocked`);
      assert.equal(missing(state), true, `${id}: its effect is missing`);
    } finally {
      dropped = null;
      await context.close();
    }
  });
}

test('only complete framework scripts count as the framework\'s', () => {
  for (const body of ['(self.__next_f=self.__next_f||[]).push([0])', 'self.__next_f.push([1,"0:\\"$Sreact.fragment\\"\\n"])',
    'requestAnimationFrame(function(){$RT=performance.now()});', '$RC("B:1","S:1")', '$RS("S:2","P:2")']) {
    assert.equal(isFrameworkScript(body), true, body);
  }
  for (const body of ['self.__next_f.push([0]);window.unregisteredCode=1', 'self.__next_f.push([0]),alert(1)',
    'self.__next_f.push(alert(1))', '(self.__next_f=self.__next_f||[]).push([0]);fetch("/x")', '$RC("B:1","S:1");alert(1)',
    '$RC("B:1",alert(1))', '$RC("B:1")', '$RX("B:1")', 'requestAnimationFrame(function(){$RT=performance.now()});alert(1)',
    '$RB=[];alert(1)', '']) {
    assert.equal(isFrameworkScript(body), false, body);
  }
});

test('a script that only looks like the framework\'s is blocked', { timeout: 90_000 }, async () => {
  planted = '<script>self.__next_f.push([0]);window.__planted="payload"</script>'
    + '<script>$RC("B:9","S:9");window.__planted="instruction"</script>';
  const { page, context } = await open('/');
  try {
    const state = await page.evaluate(() => ({ violations: window.__violations, planted: window.__planted }));
    assert.deepEqual(state.violations.map(violation => [violation.directive, violation.blocked]),
      [['script-src-elem', 'inline'], ['script-src-elem', 'inline']], 'both planted scripts are blocked');
    assert.equal(state.planted, undefined, 'neither planted script ran');
  } finally {
    planted = '';
    await context.close();
  }
});
