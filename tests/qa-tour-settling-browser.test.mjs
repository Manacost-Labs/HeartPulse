import assert from 'node:assert/strict';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { waitForTourGeometry } from '../scripts/qa/tourSettling.mjs';

test('tour readiness waits for motion without accepting missing UI or hiding bad geometry', async () => {
  const browser = await launchBrowser({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>
      body { height: 3000px; margin: 0; }
      .page-tour__dialog, .ui-tour__spotlight { position: fixed; top: 10px; width: 100px; height: 60px; }
      .page-tour__dialog { left: 10px; }
      .ui-tour__spotlight { left: 300px; }
    </style><div class="ui-tour"><div class="page-tour__dialog"></div><div class="ui-tour__spotlight"></div></div>`);
    await page.evaluate(() => {
      document.querySelector('.page-tour__dialog').animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(100px)' },
      ], { duration: 300, fill: 'forwards' });
      window.scrollTo({ top: 700, behavior: 'smooth' });
    });
    await waitForTourGeometry(page);
    const settled = await page.evaluate(() => ({
      left: document.querySelector('.page-tour__dialog').getBoundingClientRect().left,
      scroll: scrollY,
    }));
    assert.deepEqual(settled, { left: 110, scroll: 700 });

    await page.$eval('.ui-tour__spotlight', node => node.remove());
    await assert.rejects(waitForTourGeometry(page, { timeout: 150 }), /Waiting failed|timeout/i,
      'missing geometry must fail readiness');

    await page.evaluate(() => {
      const spotlight = document.createElement('div');
      spotlight.className = 'ui-tour__spotlight';
      spotlight.style.left = '-200px';
      document.querySelector('.ui-tour').append(spotlight);
    });
    const moving = await page.evaluateHandle(() => document.querySelector('.ui-tour__spotlight').animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(100px)' },
    ], { duration: 800, iterations: Infinity }));
    try {
      await assert.rejects(waitForTourGeometry(page, { timeout: 150 }), /Waiting failed|timeout/i,
        'continuously moving geometry must fail readiness even for an infinite animation');
    } finally {
      await moving.evaluate(animation => animation.cancel());
      await moving.dispose();
    }
    await waitForTourGeometry(page);
    assert.equal(await page.$eval('.ui-tour__spotlight', node => node.getBoundingClientRect().left), -200,
      'settlement must expose bad final geometry to the existing assertions, not wait for it to pass');
  } finally {
    await browser.close();
  }
});
