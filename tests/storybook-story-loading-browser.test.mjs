import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const STORY = 'tier-list-measured-loading-geometry--ready';
const STORY_MODULE = '/assets/TierListSkeleton.stories-';

async function withStoryPage(run) {
  const storybook = await startStorybookStatic();
  const executablePath = [process.env.CHROMIUM_PATH, '/usr/bin/google-chrome', '/usr/bin/chromium'].find(path => path && existsSync(path));
  const browser = await launchBrowser({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    await run(page, storybook.storyUrl(STORY));
  } finally {
    await browser.close();
    await storybook.close();
  }
}

// Fails every request for the story module during the first `loads` loads of
// the story document. Chrome may fetch a module that failed to load more than
// once in one load (its preload and the import race), so the counts are of
// document loads, not of module requests.
function failStoryModule(page, errorCode, loads) {
  let documents = 0;
  const failedLoads = new Set();
  page.on('request', request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents += 1;
    if (request.url().includes(STORY_MODULE) && documents <= loads) {
      failedLoads.add(documents);
      void request.abort(errorCode);
    } else {
      void request.continue();
    }
  });
  return { loads: () => documents, failedLoads: () => failedLoads.size };
}

test('a story whose module cannot load fails at once with Storybook\'s message', async () => {
  await withStoryPage(async (page, url) => {
    const story = failStoryModule(page, 'failed', Infinity);
    const startedAt = performance.now();
    await assert.rejects(openStory(page, url), /did not render: Failed to fetch dynamically imported module/);
    assert.ok(performance.now() - startedAt < 10_000, 'no selector timeout is spent on a failed story');
    assert.equal(story.failedLoads(), 1, 'the story module failed to load');
    assert.equal(story.loads(), 1, 'an ordinary load failure is not retried');
  });
});

test('a load the browser aborted for a network change opens the story again', async () => {
  await withStoryPage(async (page, url) => {
    // Chrome cannot be made to emit a real ERR_NETWORK_CHANGED, so the
    // transient error code is swapped for one interception can produce.
    const story = failStoryModule(page, 'connectionreset', 1);
    await openStory(page, url, { transientError: 'net::ERR_CONNECTION_RESET' });
    assert.equal(story.failedLoads(), 1);
    assert.equal(story.loads(), 2, 'the aborted load is opened once more');
    await page.waitForSelector('.tierlist-group', { visible: true, timeout: 10_000 });
  });
});

test('a transient abort on every load still fails after three loads', async () => {
  await withStoryPage(async (page, url) => {
    const story = failStoryModule(page, 'connectionreset', Infinity);
    await assert.rejects(openStory(page, url, { transientError: 'net::ERR_CONNECTION_RESET' }),
      /did not render: .*net::ERR_CONNECTION_RESET on \d+ request\(s\) in each of 3 loads/);
    assert.equal(story.failedLoads(), 3);
    assert.equal(story.loads(), 3);
  });
});
