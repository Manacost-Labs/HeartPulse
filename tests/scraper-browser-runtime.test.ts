import assert from 'node:assert/strict';
import test from 'node:test';

import {
  launchScraperBrowser,
  resolveScraperBrowserExecutable,
  verifyScraperBrowserRuntime,
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

test('browser resolver prefers the Chromium 151 line supported by Puppeteer 25.4', () => {
  const executable = resolveScraperBrowserExecutable({
    env: {},
    isExecutable: path => path === '/usr/bin/chromium' || path === '/usr/bin/google-chrome-stable',
  });

  assert.equal(executable, '/usr/bin/chromium');
});

test('browser launcher uses the resolved system executable and hardened service arguments', async () => {
  let launchOptions: Record<string, unknown> | null = null;
  const browser = {
    close: async () => {},
    version: async () => 'Chrome/151.0.7922.173',
  };
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

test('browser launcher closes and rejects a browser outside the supported major line', async () => {
  let closed = 0;

  await assert.rejects(
    launchScraperBrowser({
      env: { CHROME_BIN: '/usr/bin/chrome-fixture' },
      candidates: [],
      isExecutable: () => true,
      launch: async () => ({
        close: async () => { closed += 1; },
        version: async () => 'Chrome/150.0.7871.114',
      } as never),
    }),
    /Puppeteer 25\.4\.0 requires Chrome\/Chromium 151.*Chrome\/150\.0\.7871\.114/s,
  );
  assert.equal(closed, 1);
});

test('browser runtime smoke opens only a local data page and closes the browser', async () => {
  const events: string[] = [];

  await verifyScraperBrowserRuntime({
    env: { CHROME_BIN: '/usr/bin/chrome-fixture' },
    candidates: [],
    isExecutable: () => true,
    launch: async () => ({
      version: async () => 'Chrome/151.0.7922.173',
      newPage: async () => ({
        goto: async (url: string) => { events.push(`goto:${url}`); },
        title: async () => 'hearthpulse-runtime-ok',
      }),
      close: async () => { events.push('close'); },
    } as never),
  });

  assert.deepEqual(events, [
    'goto:data:text/html,<title>hearthpulse-runtime-ok</title>',
    'close',
  ]);
});
