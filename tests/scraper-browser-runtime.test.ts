import assert from 'node:assert/strict';
import test from 'node:test';

import {
  launchScraperBrowser,
  resolveScraperBrowserExecutable,
} from '../server/scraperBrowserRuntime.js';

test('browser resolver honors an explicit production executable', () => {
  const executable = resolveScraperBrowserExecutable({
    env: { PUPPETEER_EXECUTABLE_PATH: '/opt/chrome-for-scraper' },
    candidates: ['/usr/bin/google-chrome-stable'],
    isExecutable: path => path === '/opt/chrome-for-scraper',
  });

  assert.equal(executable, '/opt/chrome-for-scraper');
});

test('browser resolver reports every supported configuration path', () => {
  assert.throws(
    () => resolveScraperBrowserExecutable({
      env: {},
      candidates: ['/usr/bin/google-chrome-stable', '/usr/bin/chromium'],
      isExecutable: () => false,
    }),
    /Set PUPPETEER_EXECUTABLE_PATH or install a supported Chrome.*google-chrome-stable.*chromium/s,
  );
});

test('browser launcher uses the resolved system executable and hardened service arguments', async () => {
  let launchOptions: Record<string, unknown> | null = null;
  const browser = { close: async () => {} };
  const launched = await launchScraperBrowser({
    env: { CHROME_BIN: '/usr/bin/chrome-fixture' },
    candidates: [],
    isExecutable: path => path === '/usr/bin/chrome-fixture',
    launch: async options => {
      launchOptions = options as unknown as Record<string, unknown>;
      return browser as never;
    },
  });

  assert.equal(launched, browser);
  assert.equal(launchOptions?.executablePath, '/usr/bin/chrome-fixture');
  assert.equal(launchOptions?.headless, true);
  assert.deepEqual(launchOptions?.args, [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
  ]);
});
