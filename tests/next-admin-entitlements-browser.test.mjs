import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

test('Next subscribers pages preserve administrator API access without a subscription', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    runtime.backend.database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run('card-reader');
    const subscription = await fetch(`${runtime.origin}/api/subscription/status`, {
      headers: { Cookie: runtime.cookie },
    }).then(response => response.json());
    assert.equal(subscription.entitlements?.standard, false);
    assert.equal(subscription.entitlements?.arena, false);

    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const context = await browser.createBrowserContext();
    const [name, value] = runtime.cookie.split('=');
    for (const [path, api] of [
      ['/classes/', '/api/winrates'],
      ['/tierlist/', '/api/tierlist'],
      ['/legendaries/', '/api/legendaries'],
      ['/standard/matchups/', '/api/standard/matchups'],
      ['/standard/meta/', '/api/standard-meta'],
      ['/standard/archetypes/', '/api/constructed-archetypes'],
      ['/guides-archive/', '/api/guides-archive'],
      ['/heroes/', '/api/bg/heroes'],
      ['/library/', '/api/bg/library/meta'],
    ]) {
      const page = await context.newPage();
      await page.setCookie({ name, value, url: runtime.origin });
      await page.setRequestInterception(true);
      let requests = 0;
      page.on('request', request => {
        if (new URL(request.url()).pathname !== api) { request.continue(); return; }
        requests += 1;
        void request.respond({ status: 403, contentType: 'application/json', body: '{"error":"fixture"}' });
      });
      await page.goto(`${runtime.origin}${path}`, { waitUntil: 'networkidle2' });
      assert.ok(requests > 0, `${path} must request its protected API for an administrator`);
      await page.close();
    }
    const funDecks = await context.newPage();
    await funDecks.setCookie({ name, value, url: runtime.origin });
    await funDecks.setRequestInterception(true);
    funDecks.on('request', request => {
      if (new URL(request.url()).pathname !== '/api/fun-decks') { request.continue(); return; }
      const decks = Array.from({ length: 4 }, (_, index) => ({
        title: `Test deck ${index + 1}`, deckCode: `test-${index + 1}`,
        format: 'standard', className: 'mage', streamer: null, funScore: 0.8,
        maxMetaSimilarity: 0.2, nearestArchetype: null, winRate: 0.5,
        games: 100, reasons: [], url: null, firstSeenAt: null, lastSeenAt: null,
      }));
      void request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({
        fetchedAt: null, stats: { total: 4, standard: 4, wild: 0 },
        methodology: { detectorVersion: null, minFunScore: 0.55, maxMetaSimilarity: 0.42 }, decks,
      }) });
    });
    await funDecks.goto(`${runtime.origin}/standard/fun-decks/`, { waitUntil: 'networkidle2' });
    await funDecks.waitForSelector('.fun-deck-card');
    assert.equal(await funDecks.$$eval('.fun-deck-card', cards => cards.length), 4,
      'administrator must see the full fun-decks collection without a subscription');
    await funDecks.close();
    await context.close();
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
