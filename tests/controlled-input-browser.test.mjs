import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

import puppeteer from 'puppeteer';

import { replaceControlledInputValue } from '../scripts/controlled-input.mjs';

test('replaces non-empty controlled inputs through real keyboard events', async () => {
  let executablePath = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].find(candidate => candidate && existsSync(candidate));
  if (!executablePath) {
    const downloadedBrowser = await puppeteer.executablePath();
    if (existsSync(downloadedBrowser)) executablePath = downloadedBrowser;
  }
  assert.ok(executablePath, 'Puppeteer or the host must provide an executable browser');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent([
      '<input id="selector-input" value="existing selector value">',
      '<input id="handle-input" value="existing handle value">',
      '<script>',
      'for (const input of document.querySelectorAll("input")) {',
      '  input.addEventListener("input", event => {',
      '    const nextValue = event.currentTarget.value;',
      '    queueMicrotask(() => { event.currentTarget.value = nextValue; });',
      '  });',
      '}',
      '</script>',
    ].join(''));

    await replaceControlledInputValue(page, '#selector-input', 'replacement by selector');
    const handle = await page.$('#handle-input');
    assert.ok(handle);
    await replaceControlledInputValue(page, handle, 'replacement by handle');

    assert.deepEqual(await page.$$eval('input', inputs => inputs.map(input => input.value)), [
      'replacement by selector',
      'replacement by handle',
    ]);
  } finally {
    await browser.close();
  }
});
