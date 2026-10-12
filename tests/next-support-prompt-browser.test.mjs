import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { startPublicCardPilot } from './helpers/publicCardPilot.mjs';

// The public shell offers the delayed Boosty support prompt to desktop readers
// once they scroll, as the single-page shell did before the Next.js migration.
test('Next.js public pages offer the delayed support prompt after scrolling', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${runtime.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.equal(await page.$('.support-prompt'), null, 'the prompt waits until the reader engages with the page');

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForSelector('.support-prompt--collapsed', { visible: true, timeout: 10_000 });
    await page.click('.support-prompt__trigger');
    await page.waitForSelector('.support-prompt--expanded', { visible: true, timeout: 10_000 });
    assert.equal(await page.$eval('.support-prompt__button', link => link.getAttribute('href')),
      'https://boosty.to/kolodahearthstone');
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});

test('help center searches answers, filters topics and opens direct question links', async () => {
  const runtime = await startPublicCardPilot({ pagesEnabled: true, galleryEnabled: true });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    const response = await page.goto(`${runtime.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.match(await response.text(), /Как подтвердить подписку Boosty/, 'answers are present before hydration');
    await page.waitForSelector('#faq-search');
    await page.type('#faq-search', '  бусти   почту  ');
    await page.waitForFunction(() => document.querySelectorAll('.faq-page__question').length > 0
      && document.querySelectorAll('.faq-page__question').length < 10);
    assert.match(await page.$eval('.faq-page__results', el => el.textContent), /Найдено/);
    await page.click('button[aria-label="Очистить поиск"]');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'faq-search', 'clearing search keeps keyboard users in the field');
    await page.type('#faq-search', 'бусти почту');
    await page.click('.faq-page__reset');
    await page.click('[data-faq-topic="battlegrounds"]');
    assert.equal(await page.$$eval('.faq-page__section', sections => sections.map(el => el.id).join(',')), 'faq-battlegrounds');
    await page.click('[data-faq-topic="all"]');
    await page.type('#faq-search', 'неттакоговопроса123');
    await page.waitForSelector('.faq-page__empty');
    await page.click('.faq-page__empty button');
    assert.ok((await page.$$('.faq-page__question')).length >= 45);
    await page.setViewport({ width: 390, height: 844 });
    await page.select('#faq-topic', 'battlegrounds');
    assert.equal(await page.$$eval('.faq-page__section', sections => sections.map(el => el.id).join(',')), 'faq-battlegrounds');
    assert.ok(await page.evaluate(() => document.querySelector('.faq-page__results').getBoundingClientRect().top
      - document.querySelector('#faq-search').getBoundingClientRect().bottom < 400), 'mobile results stay near the search field');
    await page.type('#faq-search', 'неттакоговопроса123');
    await page.waitForSelector('.faq-page__empty');
    await page.click('.faq-page__empty a');
    await page.waitForFunction(() => document.querySelector('#faq-contact-support')?.open);
    assert.equal(await page.$eval('#faq-search', input => input.value), '', 'direct links clear filters on the same page');
    assert.equal(await page.$eval('#faq-topic', select => select.value), 'all');
    await page.goto(`${runtime.origin}/faq/#faq-newsletter`, { waitUntil: 'networkidle2' });
    await page.waitForFunction(() => document.querySelector('#faq-newsletter')?.open);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewport({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `FAQ overflow at ${width}`);
    }
    assert.deepEqual(errors, []);
    await page.setJavaScriptEnabled(false);
    await page.goto(`${runtime.origin}/faq/`, { waitUntil: 'networkidle2' });
    assert.ok((await page.$$('.faq-page__question')).length >= 45, 'native disclosures work without JavaScript');
    await page.click('#faq-register summary');
    assert.equal(await page.$eval('#faq-register', question => question.open), true);
  } finally {
    if (browser) await browser.close();
    await runtime.close();
  }
});
