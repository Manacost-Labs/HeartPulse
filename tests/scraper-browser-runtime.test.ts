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

test('browser resolver preserves the declared system candidate order', () => {
  const executable = resolveScraperBrowserExecutable({
    env: {},
    isExecutable: path => path === '/usr/bin/chromium' || path === '/usr/bin/google-chrome-stable',
  });

  assert.equal(executable, '/usr/bin/chromium');
});

test('browser launcher uses an explicit executable and hardened service arguments', async () => {
  let launchOptions: Record<string, unknown> | null = null;
  const browser = {
    close: async () => {},
    version: async () => 'Chrome/152.0.8000.10',
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

test('an invalid explicit browser path fails fast without trying system defaults', async () => {
  const launched: string[] = [];

  await assert.rejects(
    launchScraperBrowser({
      env: { PUPPETEER_EXECUTABLE_PATH: '/opt/missing-explicit-browser' },
      candidates: ['/usr/bin/working-default'],
      isExecutable: path => path === '/usr/bin/working-default',
      launch: async options => {
        launched.push(String(options.executablePath));
        return {} as never;
      },
    }),
    /Configured PUPPETEER_EXECUTABLE_PATH is not executable: \/opt\/missing-explicit-browser/,
  );
  assert.deepEqual(launched, []);
});

test('browser launcher closes a failed default candidate and tries the next executable', async () => {
  const launched: string[] = [];
  let closed = 0;

  const browser = await launchScraperBrowser({
    env: {},
    candidates: ['/usr/bin/chromium-150', '/usr/bin/chromium-151'],
    isExecutable: () => true,
    launch: async options => {
      const executablePath = String(options.executablePath);
      launched.push(executablePath);
      if (executablePath.endsWith('150')) {
        return {
          close: async () => { closed += 1; },
          version: async () => { throw new Error('protocol handshake failed'); },
        } as never;
      }
      return {
        close: async () => { closed += 1; },
        version: async () => 'Chrome/151.0.7922.173',
      } as never;
    },
  });

  assert.deepEqual(launched, ['/usr/bin/chromium-150', '/usr/bin/chromium-151']);
  assert.equal(closed, 1, 'the failed browser must be closed before the next candidate launches');
  await browser.close();
  assert.equal(closed, 2);
});

test('browser launcher accepts Chromium 152 when the real runtime contract passes', async () => {
  const logs: string[] = [];
  const browser = await launchScraperBrowser({
    env: { CHROME_BIN: '/usr/bin/chromium-152' },
    candidates: [],
    isExecutable: () => true,
    log: message => { logs.push(message); },
    launch: async () => ({
      close: async () => {},
      version: async () => 'Chromium/152.0.8000.10',
    } as never),
  });

  assert.match(logs.join('\n'), /puppeteer=25\.4\.0.*browser=Chromium\/152\.0\.8000\.10/s);
  await browser.close();
});

test('browser runtime smoke opens only a local data page and closes the browser', async () => {
  const events: string[] = [];

  await verifyScraperBrowserRuntime({
    env: { CHROME_BIN: '/usr/bin/chrome-fixture' },
    candidates: [],
    isExecutable: () => true,
    launch: async () => ({
      version: async () => 'Chrome/152.0.8000.10',
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

test('browser runtime smoke closes an incompatible default and succeeds with the next candidate', async () => {
  const events: string[] = [];

  await verifyScraperBrowserRuntime({
    env: {},
    candidates: ['/usr/bin/closed-first', '/usr/bin/working-second'],
    isExecutable: () => true,
    launch: async options => {
      const executablePath = String(options.executablePath);
      return {
        version: async () => executablePath.endsWith('closed-first')
          ? 'Chrome/150.0.7871.114'
          : 'Chrome/152.0.8000.10',
        newPage: async () => ({
          goto: async (url: string) => { events.push(`goto:${executablePath}:${url}`); },
          title: async () => executablePath.endsWith('closed-first') ? 'incompatible-runtime' : 'hearthpulse-runtime-ok',
        }),
        close: async () => { events.push(`close:${executablePath}`); },
      } as never;
    },
  });

  assert.deepEqual(events, [
    'goto:/usr/bin/closed-first:data:text/html,<title>hearthpulse-runtime-ok</title>',
    'close:/usr/bin/closed-first',
    'goto:/usr/bin/working-second:data:text/html,<title>hearthpulse-runtime-ok</title>',
    'close:/usr/bin/working-second',
  ]);
});
