import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { qaSessionCookie } from '../scripts/qa/mockApi.mjs';
import { startQaNextRuntime } from '../scripts/qa/nextRuntime.mjs';
import { builds, summary } from './fixtures/viciousGoldPayload.mjs';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const json = body => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
// The meta page's tier floors (standardMetaClassModel.ts) applied to the vS power win rate.
const TIERS = [['S', 53, Infinity], ['A', 51, 53], ['B', 49, 51], ['C', 47, 49], ['D', -Infinity, 47]];

async function openAsSubscriber(browser, origin, viewport) {
  const page = await browser.newPage();
  const [name, value] = qaSessionCookie().split('=');
  await page.setCookie({ name, value, url: origin });
  await page.setRequestInterception(true);
  page.on('request', request => {
    const { pathname } = new URL(request.url());
    if (pathname === '/api/vicious-syndicate-gold') return request.respond(json(summary));
    if (pathname === '/api/vicious-syndicate-gold/builds') return request.respond(json(builds));
    return request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    window.__layoutShift = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__layoutShift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.setViewport(viewport);
  await page.goto(`${origin}/standard/vicious-gold/`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => document.querySelector('.vsgold-decks__head')?.textContent?.includes('24 из 28'));
  return page;
}

function readTiers(page) {
  return page.$$eval('.vsgold-tier', tiers => tiers.map(tier => ({
    tier: tier.dataset.tier,
    note: tier.querySelector('.vsgold-tier__head small')?.textContent ?? '',
    winrates: [...tier.querySelectorAll('.vsgold-power-row__winrate')].map(node => Number.parseFloat(node.textContent.replace(',', '.'))),
    icons: [...tier.querySelectorAll('.vsgold-power-row > img')].map(node => node.getAttribute('src')),
  })));
}

function assertTiers(tiers, label) {
  assert.ok(tiers.length > 0, `${label}: the Power Tier board must show at least one tier`);
  const order = TIERS.map(([tier]) => tier);
  assert.deepEqual(tiers.map(item => item.tier), order.filter(tier => tiers.some(item => item.tier === tier)), `${label}: tiers run from S down`);
  for (const item of tiers) {
    const [, from, to] = TIERS.find(([tier]) => tier === item.tier);
    assert.ok(item.winrates.every(winrate => winrate >= from && winrate < to), `${label}: tier ${item.tier} holds only its win rates`);
    assert.match(item.note, new RegExp(`· ${item.winrates.length} колод`), `${label}: tier ${item.tier} counts its decks`);
  }
}

// The subscriber view of /standard/vicious-gold/: the report plate, Power Tier S–D, meta shares and a stable first screen.
test('Vicious Gold reads as a ranked report and keeps its place while loading', { timeout: 120_000 }, async () => {
  const runtime = await startQaNextRuntime();
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await openAsSubscriber(browser, runtime.origin, { width: 1440, height: 900 });
    assert.ok(await page.evaluate(() => window.__layoutShift) < 0.02,
      'the access check, the loader and the statistics must share one banner and one place');

    assert.match(await page.$eval('.vsgold-report h2', node => node.textContent), /последние 24 часа/, 'the report names its window');
    assert.equal(await page.$$eval('.vsgold-report__kpis > li', tiles => tiles.length), 4);

    assertTiers(await readTiers(page), 'all ranks');
    assert.equal(await page.$$eval('.vsgold-power-row', rows => rows.length), summary.tierList[0].decks.length);
    assert.equal(await page.$$eval('.vsgold-power-row__delta .ui-trend-value', nodes => nodes.length), 0, 'all ranks is its own baseline');
    const links = await page.$$eval('.vsgold-power-row a.vsgold-power-row__name', nodes => nodes.map(node => node.getAttribute('href')));
    const linked = summary.tierList[0].decks.filter(deck => deck.archetypeSlug);
    assert.deepEqual(links, linked.map(deck => `/standard/archetypes/standard/${deck.archetypeSlug}/`), 'a deck links to its archetype page');
    assert.ok(linked.length < summary.tierList[0].decks.length, 'the fixture keeps a deck without a page');

    await page.click('.vsgold-power__ranks button:nth-child(2)');
    assertTiers(await readTiers(page), 'legend');
    assert.ok(await page.$$eval('.vsgold-power-row__delta .ui-trend-value', nodes => nodes.length) > 0, 'a bracket shows its change against all ranks');
    await page.select('.vsgold-power__controls select', 'Warrior');
    const warrior = await readTiers(page);
    assertTiers(warrior, 'legend warriors');
    assert.ok(warrior.flatMap(item => item.icons).every(src => src.includes('/warrior-')), 'the class filter narrows the board');

    assert.equal(await page.$$eval('.vsgold-classbars button', buttons => buttons.length), summary.classDistribution.length);
    const segments = await page.$$eval('.vsgold-classbars__segment:not(.vsgold-classbars__segment--rest)', nodes => nodes.map(node => ({
      title: node.getAttribute('title') ?? '', text: node.textContent ?? '', color: getComputedStyle(node).backgroundColor,
    })));
    assert.equal(segments.length, summary.deckDistribution.length, 'every archetype is a segment of its class bar');
    assert.ok(segments.every(segment => /\d,?\d*%$/.test(segment.title)), 'every segment names its archetype and share on hover');
    assert.ok(segments.filter(segment => segment.text).length >= segments.length / 2, 'most segments write their name or share in');
    assert.ok(new Set(segments.map(segment => segment.color)).size > summary.classDistribution.length, 'archetypes of a class differ in shade');
    await page.click('.vsgold-classbars li:nth-child(2) button');
    const mage = await page.$$eval('.vsgold-deck-row > img', nodes => nodes.map(node => node.getAttribute('src')));
    assert.ok(mage.length > 0 && mage.every(src => src.includes('/mage-')), 'a class in the shares filters the deck list');
    assert.equal(await page.evaluate(() => document.querySelector('.vsgold')?.textContent?.includes('Сборка обновляется')), false,
      'a deck without a build shows nothing instead of a repeated note');

    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => (await globalThis.axe.run(document.querySelector('.vsgold')))
      .violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => violation.id));
    assert.deepEqual(violations, []);
    await page.close();

    const phone = await openAsSubscriber(browser, runtime.origin, { width: 390, height: 844, isMobile: true, hasTouch: true });
    const growth = await phone.evaluate(async () => {
      const start = document.documentElement.scrollHeight;
      while (scrollY + innerHeight < document.documentElement.scrollHeight - 2) {
        scrollBy(0, 500);
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      return Math.abs(document.documentElement.scrollHeight - start);
    });
    assert.ok(growth < 250, `the page height changed by ${growth}px while scrolling`);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const targets = await phone.$$eval('.vsgold-power__ranks button, .vsgold-classbars button, .vsgold-build button, .vsgold-report__contents a',
      nodes => nodes.map(node => node.getBoundingClientRect().height));
    assert.ok(targets.length > 0 && targets.every(height => height >= 44), 'every control keeps a 44px touch target');
    assert.ok(await phone.evaluate(() => window.__layoutShift) < 0.02);
    await phone.close();
  } finally {
    await browser?.close();
    await runtime.close();
  }
});
