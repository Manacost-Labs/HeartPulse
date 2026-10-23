import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const axe = readFileSync(fileURLToPath(import.meta.resolve('axe-core')), 'utf8');
const PRIVATE_VALUES = ['card-reader@example.test', 'card-reader', 'qa-contact-telegram'];

// The whole public profile path on the real Express API and Next: the owner
// picks a nickname in the account page, the nickname link redirects to the
// canonical numeric page, and that page shows only the public fields.
test('a player sets a nickname and shares a public profile that shows only public fields', { timeout: 90_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET public_numeric_id = 7, contact_telegram = 'qa-contact-telegram' WHERE id = 'card-reader'").run();
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const owner = await browser.newPage();
    await owner.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => { window.__copied = value; } } });
    });
    const [name, value] = runtime.cookie.split('=');
    await owner.setCookie({ name, value, url: runtime.origin });

    // The account page shows the short link before any nickname exists.
    await owner.setViewport({ width: 390, height: 1000 });
    await owner.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    await owner.waitForSelector('#account-public-profile .account-links__row a');
    assert.deepEqual(await owner.$$eval('#account-public-profile .account-links__row a', links => links.map(link => link.textContent)),
      [`${runtime.origin}/id/7/`]);

    // A refused nickname reports the server's reason; a valid one is saved.
    await owner.type('#account-nickname', 'admin');
    await owner.click('#account-public-profile button[type="submit"]');
    await owner.waitForFunction(() => document.querySelector('.account-message--err')?.textContent?.includes('зарезервирован'));
    await owner.$eval('#account-nickname', input => { input.select(); });
    await owner.type('#account-nickname', 'Arena_Master');
    await owner.click('#account-public-profile button[type="submit"]');
    await owner.waitForFunction(() => document.querySelector('#account-nickname')?.disabled === true);
    assert.match(await owner.$eval('#account-nickname-hint', hint => hint.textContent), /Следующая смена/,
      'the 30-day limit locks the field and says until when');
    assert.deepEqual(await owner.$$eval('#account-public-profile .account-links__row a', links => links.map(link => link.textContent)),
      [`${runtime.origin}/id/7/`], 'the nickname link waits for the Nginx /u/ route');
    await owner.click('button[aria-label="Скопировать короткую ссылку"]');
    await owner.waitForFunction(() => Boolean(window.__copied));
    assert.equal(await owner.evaluate(() => window.__copied), `${runtime.origin}/id/7/`);

    for (const width of [320, 390, 1440]) {
      await owner.setViewport({ width, height: 1000 });
      await owner.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
      await owner.waitForSelector('#account-public-profile .account-links__row');
      assert.equal(await owner.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `account overflow at ${width}px`);
      const small = await owner.$$eval('#account-public-profile :is(button, input)', controls => controls
        .filter(control => control.getClientRects().length && control.getBoundingClientRect().height < 40)
        .map(control => control.outerHTML.slice(0, 80)));
      assert.deepEqual(small, [], `public profile controls are at least 40 px high at ${width}px`);
    }

    // Cross-site and header-less changes are refused even with the session cookie.
    const forged = await owner.evaluate(() => fetch('/api/account/public-profile/nickname', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: 'Forged_Name' }),
    }).then(response => response.status));
    assert.equal(forged, 403, 'a nickname change needs the X-CSRF-Request header');

    // The nickname link is a permanent redirect to the canonical numeric page.
    const alias = await fetch(`${runtime.origin}/u/arena_master/`, { redirect: 'manual' });
    assert.equal(alias.status, 301);
    assert.equal(alias.headers.get('location'), '/id/7/');
    for (const path of ['/u/nobody-here/', '/id/999/', '/id/0/', '/profiles/p_AbCdEfGhIjKlMnOpQrStUv/']) {
      assert.equal((await fetch(`${runtime.origin}${path}`)).status, 404, path);
    }

    // A visitor without a session sees only the allow-listed fields.
    const api = await fetch(`${runtime.origin}/api/profiles/7`).then(response => response.json());
    assert.deepEqual(Object.keys(api.profile).sort(),
      ['avatarInitials', 'displayName', 'isSubscriber', 'memberSince', 'nickname', 'publicProfileId']);
    const document = await fetch(`${runtime.origin}/id/7/`);
    const html = await document.text();
    assert.equal(document.status, 200);
    assert.match(html, /<h1[^>]*>Arena_Master<\/h1>/);
    assert.match(html, /name="robots" content="noindex, follow"/);
    assert.match(html, /rel="canonical" href="https:\/\/hearthpulse\.net\/id\/7\/"/);
    assert.match(html, /property="og:title" content="Arena_Master — профиль игрока \| HearthPulse"/);
    assert.match(html, /property="og:image" content="[^"]*\/assets\/og-preview\.png"/);
    for (const secret of PRIVATE_VALUES) assert.equal(html.includes(secret), false, `profile HTML leaked ${secret}`);

    const visitorContext = await browser.createBrowserContext();
    const visitor = await visitorContext.newPage();
    for (const width of [1440, 390, 320]) {
      await visitor.setViewport({ width, height: 900 });
      const response = await visitor.goto(`${runtime.origin}/u/Arena_Master/`, { waitUntil: 'networkidle2' });
      assert.equal(new URL(response.url()).pathname, '/id/7/');
      await visitor.evaluate(axe);
      const state = await visitor.evaluate(async () => ({
        h1: [...document.querySelectorAll('h1')].map(node => node.textContent?.trim()),
        chips: [...document.querySelectorAll('.profile-status-chip')].map(node => node.textContent?.trim()),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        violations: (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }))
          .violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })),
      }));
      assert.deepEqual(state.h1, ['Arena_Master']);
      assert.equal(state.chips.length, 1, 'only the member-since chip: this account has no subscription');
      assert.match(state.chips[0], /^На HearthPulse с /);
      assert.equal(state.overflow, false, `profile overflow at ${width}px`);
      assert.deepEqual(state.violations, []);
    }
    await visitorContext.close();

    // A blocked account disappears like a missing one.
    runtime.backend.database.prepare("UPDATE users SET blocked_at = ? WHERE id = 'card-reader'").run(new Date().toISOString());
    assert.equal((await fetch(`${runtime.origin}/id/7/`)).status, 404);
    assert.equal((await fetch(`${runtime.origin}/u/arena_master/`, { redirect: 'manual' })).status, 404);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
