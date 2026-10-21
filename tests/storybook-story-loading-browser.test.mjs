import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const STORY = 'tier-list-measured-loading-geometry--ready';
const STORY_MODULE = '/assets/TierListSkeleton.stories-';

async function withStoryPage(run) {
  const storybook = await startStorybookStatic();
  const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    await run(page, storybook.storyUrl(STORY));
  } finally {
    await browser.close();
    await storybook.close();
  }
}

// Fails the story module request the first `count` times it is fetched.
function failStoryModule(page, errorCode, count) {
  let failures = 0;
  page.on('request', request => {
    if (request.url().includes(STORY_MODULE) && failures < count) {
      failures += 1;
      void request.abort(errorCode);
    } else {
      void request.continue();
    }
  });
  return () => failures;
}

test('a story whose module cannot load fails at once with Storybook\'s message', async () => {
  await withStoryPage(async (page, url) => {
    const failures = failStoryModule(page, 'failed', Infinity);
    const startedAt = performance.now();
    await assert.rejects(openStory(page, url), /did not render: Failed to fetch dynamically imported module/);
    assert.ok(performance.now() - startedAt < 10_000, 'no selector timeout is spent on a failed story');
    assert.equal(failures(), 1, 'an ordinary load failure is not retried');
  });
});

test('a load the browser aborted for a network change opens the story again', async () => {
  await withStoryPage(async (page, url) => {
    // Chrome cannot be made to emit a real ERR_NETWORK_CHANGED, so the
    // transient error code is swapped for one interception can produce.
    const failures = failStoryModule(page, 'connectionreset', 1);
    await openStory(page, url, { transientError: 'net::ERR_CONNECTION_RESET' });
    assert.equal(failures(), 1);
    await page.waitForSelector('.tierlist-group', { visible: true, timeout: 10_000 });
  });
});

test('a transient abort on every load still fails after three loads', async () => {
  await withStoryPage(async (page, url) => {
    const failures = failStoryModule(page, 'connectionreset', Infinity);
    await assert.rejects(openStory(page, url, { transientError: 'net::ERR_CONNECTION_RESET' }),
      /did not render: .*net::ERR_CONNECTION_RESET on 1 request\(s\) in each of 3 loads/);
    assert.equal(failures(), 3);
  });
});
