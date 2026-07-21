import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { inspectHorizontalLayoutFault } from '../scripts/mobile-layout-diagnostics.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));

assert.ok(chromiumPath, 'Chromium/Chrome executable is required for layout diagnostic tests');

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: chromiumPath,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 320, height: 568 });

  await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.too-wide{width:500px;height:40px}</style><div class="too-wide">overflow</div>');
  const overflow = await page.evaluate(inspectHorizontalLayoutFault);
  assert.deepEqual(overflow.viewport, { width: 320, height: 568 });
  assert.equal(overflow.page.scrollWidth, 500);
  assert.match(overflow.firstLayoutFault?.element || '', /div\.too-wide/);
  assert.ok((overflow.firstLayoutFault?.rect?.right || 0) > 320);

  await page.setContent('<style>body{margin:0}.scroller{width:280px;overflow-x:auto}.inner{width:600px;height:40px}</style><div class="scroller"><div class="inner">scroll</div></div>');
  const intentionalScroller = await page.evaluate(inspectHorizontalLayoutFault);
  assert.equal(intentionalScroller.page.scrollWidth, 320);
  assert.equal(intentionalScroller.firstLayoutFault, null);

  await page.setContent('<style>body{margin:0}.wide-vector{display:block;width:480px;height:40px}</style><svg class="wide-vector"></svg>');
  const svgOverflow = await page.evaluate(inspectHorizontalLayoutFault);
  assert.match(svgOverflow.firstLayoutFault?.element || '', /svg\.wide-vector/);
} finally {
  await browser.close();
}

console.log('Mobile layout diagnostic tests passed');
