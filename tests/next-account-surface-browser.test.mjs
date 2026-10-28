import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scryptSync } from 'node:crypto';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

const surfaceClasses = page => page.$eval('.arena-app-shell', shell => [...shell.classList]
  .filter(name => name.startsWith('arena-app-') && name !== 'arena-app-shell').sort());

test('a delayed account chunk does not reveal a footer that jumps away on load', { timeout: 45000 }, async () => {
  const chunks = join('apps/public-web/.next/static/chunks');
  const accountChunk = readdirSync(chunks, { recursive: true }).find(name => name.endsWith('.js')
    && readFileSync(join(chunks, name), 'utf8').includes('account-dashboard'));
  assert.ok(accountChunk, 'the built account view has a lazy chunk');
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    for (const width of [390, 1440]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height: 1000 });
      const [name, value] = runtime.cookie.split('=');
      await page.setCookie({ name, value, url: runtime.origin });
      let held;
      const requested = new Promise(resolve => page.on('request', request => {
        if (new URL(request.url()).pathname === `/_next/static/chunks/${accountChunk}`) {
          held = request; resolve();
        } else request.continue();
      }));
      await page.setRequestInterception(true);
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'domcontentloaded' });
      await requested;
      await page.waitForSelector('.arena-content');
      const footerTop = await page.$eval('footer', footer => footer.getBoundingClientRect().top);
      assert.ok(footerTop >= 1000, `loading must keep the footer outside the initial viewport at ${width}px (top=${footerTop})`);
      await held.continue();
      await page.waitForSelector('.account-dashboard .account-hero');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

// The profile and home styles are scoped by the surface class on the shell,
// which the single-page shell set to `arena-app-profile` on account pages and
// to `arena-app-home` alone on the home page.
test('Next.js account and home pages carry their own shell surface', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });

    await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.account-dashboard .account-hero', { timeout: 15_000 });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-profile']);
    assert.equal(await page.title(), 'Личный кабинет — HearthPulse');
    assert.deepEqual(await page.$$eval('h1', headings => headings.map(heading => heading.id)), ['account-title'],
      'the account name is the only page heading');

    await page.goto(`${runtime.origin}/`, { waitUntil: 'networkidle2' });
    assert.deepEqual(await surfaceClasses(page), ['arena-app-home']);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('the Next.js account page shows the plan and keeps settings usable', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const [name, value] = runtime.cookie.split('=');
    await page.setCookie({ name, value, url: runtime.origin });
    const overflows = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const openAccount = async width => {
      await page.setViewport({ width, height: 1000 });
      await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    };

    // Without a subscription the plan section offers the Boosty confirmation first.
    await openAccount(390);
    await page.waitForSelector('.account-plan--none #account-boosty-email');
    assert.match(await page.$eval('.account-hero__pill', pill => pill.textContent), /Без подписки/);
    assert.equal(await overflows(), false);

    runtime.grant();
    for (const width of [320, 390, 1440]) {
      await openAccount(width);
      await page.waitForSelector('.account-plan--active .account-access__tile');
      assert.match(await page.$eval('.account-hero__pill', pill => pill.textContent), /Подписка активна/);
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).borderTopWidth), '0px',
        'the account page must not draw the frame of a data page');
      assert.equal(await page.$eval('.arena-content', content => getComputedStyle(content).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await overflows(), false, `account overflow at ${width}px`);
      assert.ok(await page.$eval('#account-settings input:not([type="checkbox"])', input => input.getBoundingClientRect().height) >= 44);
      const small = await page.$$eval('.account-dashboard :is(a.account-button, button, .account-hero__action)', controls => controls
        .filter(control => control.getClientRects().length && control.getBoundingClientRect().height < 40)
        .map(control => control.textContent.trim()));
      assert.deepEqual(small, [], `every account control is at least 40 px high at ${width}px`);
      const actions = await page.$$eval('.account-hero__action', items => items.map(item => item.getBoundingClientRect().right));
      assert.ok(actions.every(right => right <= width), `hero actions stay on screen at ${width}px`);
      assert.equal(await page.$$eval('.account-dashboard button', buttons => buttons.filter(button => button.textContent.trim() === 'Выйти').length), 1,
        'sign-out is offered once');
    }
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('sign in with a code, see linked methods, start linking Google and sign out', { timeout: 60_000 }, async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true,
    backendEnv: { GOOGLE_OAUTH_CLIENT_ID: 'qa-google-client', GOOGLE_OAUTH_CLIENT_SECRET: 'qa-google-secret' } });
  let browser;
  try {
    const email = 'linker@example.test';
    const password = 'qa-password-123';
    const now = new Date().toISOString();
    runtime.backend.database.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('linker', email, 'Связной', `scrypt:qa-fixture:${scryptSync(password, 'qa-fixture', 64).toString('hex')}`, 'user', now, now);

    browser = await launchBrowser({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1000 });
    const consoleErrors = [];
    page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) consoleErrors.push(message.text()); });
    let googleAuthorization = null;
    let holdLinked = false;
    const heldLinked = [];
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (holdLinked && new URL(request.url()).pathname === '/api/account/linked-providers') {
        heldLinked.push(request);
      } else if (new URL(request.url()).hostname === 'accounts.google.com') {
        googleAuthorization = request.url();
        void request.respond({ status: 200, contentType: 'text/html', body: '<p>google</p>' });
      } else void request.continue();
    });

    // Sign in: password, then the one-time code from the e-mail.
    const signIn = async (address, name) => {
      await page.waitForSelector('#login-card-title');
      // The card remembers the last address; replace it.
      await page.focus('input[type="email"]');
      await page.keyboard.down('Control');
      await page.keyboard.press('KeyA');
      await page.keyboard.up('Control');
      await page.keyboard.press('Backspace');
      await page.type('input[type="email"]', address);
      await page.type('input[autocomplete="current-password"]', password);
      assert.deepEqual(await page.$eval('form', form => [form.querySelector('input[type="email"]').value,
        form.querySelector('input[autocomplete="current-password"]').value]), [address, password],
      'the sign-in form holds what was typed');
      await page.click('button.login-submit');
      const delivery = await runtime.backend.smtp.delivery(address);
      const code = delivery.body.match(/Ваш код входа: (\d{6})/)?.[1];
      assert.ok(code, 'the login e-mail carries a code');
      delivery.accept();
      await page.waitForSelector('input[autocomplete="one-time-code"]');
      await page.type('input[autocomplete="one-time-code"]', code);
      await page.click('button.login-submit');
      await page.waitForFunction(expected => document.querySelector('.account-hero h1')?.textContent === expected, { timeout: 15_000 }, name);
    };
    await page.goto(`${runtime.origin}/?login`, { waitUntil: 'networkidle2' });
    await signIn(email, 'Связной');
    assert.equal(await page.$eval('.account-hero h1', heading => heading.textContent), 'Связной');

    // The server answers only this account's provider names; Google is offered for linking.
    const linked = await page.evaluate(() => fetch('/api/account/linked-providers', { credentials: 'same-origin' })
      .then(async response => ({ status: response.status, cache: response.headers.get('cache-control'), body: await response.json() })));
    assert.equal(linked.status, 200);
    assert.equal(linked.cache, 'no-store');
    assert.deepEqual(linked.body, { providers: ['email'] });
    const googleLink = await page.waitForSelector('.account-links__row a[href*="/api/auth/google/start"]');
    assert.match(await googleLink.evaluate(link => link.getAttribute('href')), /returnTo=%2F%3Flogin%26linked%3Dgoogle/);

    // Linking starts at the provider with this session attached: the server keeps linkUserId in its state cookie.
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), googleLink.click()]);
    assert.ok(googleAuthorization, 'the link button leads to Google');
    const authorization = new URL(googleAuthorization);
    assert.equal(authorization.searchParams.get('client_id'), 'qa-google-client');
    assert.ok(authorization.searchParams.get('state'));
    assert.ok((await page.cookies(`${runtime.origin}/api/auth/google/callback`)).some(cookie => cookie.name === 'manacost_google_oauth'),
      'the link flow keeps its state cookie for the callback');

    // A finished link returns to the account with one message; the identity shows as linked.
    runtime.backend.database.prepare(`INSERT INTO identities (user_id, provider, provider_user_id, email, username, photo_url, verified_at, created_at, updated_at)
      VALUES (?, 'google_oauth', 'qa-google-subject', '', 'linker', '', ?, ?, ?)`).run('linker', now, now, now);
    await page.goto(`${runtime.origin}/?login&linked=google`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.account-message--ok');
    assert.match(await page.$eval('.account-message--ok', message => message.textContent), /Google привязан/);
    assert.equal(await page.evaluate(() => location.search), '?login', 'the link marker leaves the address');
    await page.waitForFunction(() => [...document.querySelectorAll('.account-links__row')]
      .some(row => row.textContent.includes('Google') && row.querySelector('.account-links__ok')));

    // Sign out ends the session on the server and shows the sign-in card again.
    await page.click('.account-logout');
    await page.waitForSelector('#login-card-title');
    const after = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'same-origin' }).then(response => response.json()));
    assert.equal(after.user ?? null, null, 'the server no longer knows the session');
    assert.equal(await page.$('.account-hero'), null);
    assert.equal(runtime.backend.database.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id = 'linker'").get().count, 0);

    // Another account in the same tab, without a reload: while its own answer is
    // pending, the previous account's Google is neither shown as linked nor
    // hides «Привязать».
    runtime.backend.database.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('second', 'second@example.test', 'Второй', `scrypt:qa-fixture:${scryptSync(password, 'qa-fixture', 64).toString('hex')}`, 'user', now, now);
    holdLinked = true;
    await signIn('second@example.test', 'Второй');
    await page.waitForSelector('.account-links__row');
    while (heldLinked.length === 0) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.account-links__row')]
      .some(row => row.textContent.includes('Google'))), false, 'the pending account shows no Google state at all');
    holdLinked = false;
    for (const request of heldLinked.splice(0)) await request.continue();
    await page.waitForFunction(() => [...document.querySelectorAll('.account-links__row')]
      .some(row => row.textContent.includes('Google') && row.querySelector('a[href*="/api/auth/google/start"]')));
    assert.deepEqual(consoleErrors, []);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
