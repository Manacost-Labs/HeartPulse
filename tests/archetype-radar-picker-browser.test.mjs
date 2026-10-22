import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { openStory, startStorybookStatic } from './helpers/storybookStatic.mjs';

const chromiumPath = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!chromiumPath) throw new Error('Chromium/Chrome executable is required for the archetype radar picker test');

// The opponent list of the archetype comparison portals into a layer placed
// before the sticky radar. Without a z-index token the radar painted over the
// open list, and without a popover padding the group separators overflowed it
// sideways. The story renders the comparison on a real-data snapshot.
const storybook = await startStorybookStatic();
const radarStory = storybook.storyUrl('archetype-detail-comparisons-on-real-data--radar');
const viewports = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 375, height: 812, isMobile: true, hasTouch: true },
  { width: 414, height: 896, isMobile: true, hasTouch: true },
];

/** Every probe point of the visible part of the open list must hit the list itself, not the radar beside or under it. */
function listGeometry() {
  const popover = document.querySelector('.archetype-radar__layer .ui-listbox__popover');
  const listbox = popover?.querySelector('[role="listbox"]');
  if (!popover || !listbox) return null;
  const rect = popover.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const covered = [];
  for (const fx of [0.08, 0.3, 0.5, 0.7, 0.92]) {
    for (const fy of [0.08, 0.3, 0.5, 0.7, 0.92]) {
      const x = rect.left + rect.width * fx;
      const y = top + (bottom - top) * fy;
      const hit = document.elementFromPoint(x, y);
      if (!popover.contains(hit)) covered.push(`${Math.round(x)},${Math.round(y)}: ${hit?.closest('[class]')?.getAttribute('class')}`);
    }
  }
  const clippedLabels = [...listbox.querySelectorAll('.ui-menu-item__label')]
    .filter(label => label.scrollWidth > label.clientWidth + 1)
    .map(label => label.textContent);
  return {
    covered,
    sideways: listbox.scrollWidth - listbox.clientWidth,
    clippedLabels,
    left: rect.left,
    right: rect.right,
    viewportWidth: document.documentElement.clientWidth,
    scrollable: listbox.scrollHeight > listbox.clientHeight,
  };
}

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));

  for (const viewport of viewports) {
    const label = `${viewport.width}px`;
    await page.setViewport({ deviceScaleFactor: 1, ...viewport });
    await openStory(page, radarStory);
    await page.waitForSelector('.archetype-radar .profile-radar');
    await page.$eval('.archetype-radar', radar => radar.scrollIntoView({ block: 'start' }));
    await page.click('.archetype-radar .ui-combobox__toggle');
    await page.waitForSelector('.archetype-radar__layer .ui-listbox__popover [role="option"]', { visible: true });
    await page.waitForFunction(() => !document.querySelector('.archetype-radar__layer .ui-listbox__popover')?.getAnimations().length);

    const geometry = await page.evaluate(listGeometry);
    assert.ok(geometry, `${label}: the list opens in the comparison layer`);
    assert.deepEqual(geometry.covered, [], `${label}: nothing paints over the open list`);
    assert.ok(geometry.sideways <= 0, `${label}: the list scrolls sideways by ${geometry.sideways}px`);
    assert.deepEqual(geometry.clippedLabels, [], `${label}: every archetype name is readable in full`);
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.viewportWidth + 0.5,
      `${label}: the list stays inside the viewport (${geometry.left}–${geometry.right} of ${geometry.viewportWidth})`);
    assert.equal(geometry.scrollable, true, `${label}: the list is long enough to scroll`);
    await page.keyboard.press('Escape');
  }

  // Keyboard: the highlight walks down the list and keeps itself in view; Enter picks the archetype.
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await openStory(page, radarStory);
  await page.waitForSelector('.archetype-radar .profile-radar');
  await page.$eval('.archetype-radar', radar => radar.scrollIntoView({ block: 'start' }));
  await page.focus('#archetype-radar-opponent');
  await page.keyboard.press('ArrowDown');
  await page.waitForSelector('.archetype-radar__layer [role="listbox"]', { visible: true });
  await page.$eval('.archetype-radar__layer [role="listbox"]', listbox => { listbox.scrollTop = 0; });
  const firstActive = await page.$eval('#archetype-radar-opponent', input => input.getAttribute('aria-activedescendant'));
  for (let step = 0; step < 14; step += 1) await page.keyboard.press('ArrowDown');
  const walked = await page.evaluate(() => {
    const input = document.querySelector('#archetype-radar-opponent');
    const listbox = document.querySelector('.archetype-radar__layer [role="listbox"]');
    const active = document.getElementById(input.getAttribute('aria-activedescendant') ?? '');
    const box = listbox.getBoundingClientRect();
    const row = active?.getBoundingClientRect();
    return {
      id: active?.id,
      name: active?.querySelector('.ui-menu-item__label')?.textContent,
      scrollTop: listbox.scrollTop,
      inView: Boolean(row && row.top >= box.top - 1 && row.bottom <= box.bottom + 1),
    };
  });
  assert.ok(walked.id && walked.id !== firstActive, 'ArrowDown moves the highlight');
  assert.ok(walked.scrollTop > 0, 'the list scrolls to follow the highlight');
  assert.equal(walked.inView, true, 'the highlighted row stays visible');
  await page.keyboard.press('Enter');
  await page.waitForFunction(name => document.querySelector('.archetype-radar__summary')?.textContent?.includes(name), {}, walked.name);
  // Enter closes the list once its exit animation ends.
  await page.waitForFunction(() => !document.querySelector('.archetype-radar__layer .ui-listbox__popover'));

  // The wheel scrolls the list itself.
  await page.click('.archetype-radar .ui-combobox__toggle');
  await page.waitForSelector('.archetype-radar__layer [role="listbox"]', { visible: true });
  const box = await page.$eval('.archetype-radar__layer [role="listbox"]', listbox => {
    listbox.scrollTop = 0;
    const rect = listbox.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(box.x, box.y);
  await page.mouse.wheel({ deltaY: 240 });
  await page.waitForFunction(() => document.querySelector('.archetype-radar__layer [role="listbox"]').scrollTop > 0);

  assert.deepEqual(runtimeErrors, []);
  console.log('Archetype radar picker browser test passed');
} finally {
  await browser?.close();
  await storybook.close();
}
