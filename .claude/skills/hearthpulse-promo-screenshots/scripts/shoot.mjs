// Promo screenshots of HearthPulse pages from a JSON list of shots.
//
//   node .claude/skills/hearthpulse-promo-screenshots/scripts/shoot.mjs \
//     --config <shots.json> --out <folder> [--origin <url>] [--only id,id]
//
// Without --origin the script starts the local stand (stand.mjs) and always
// stops it at the end. Config format: references/config.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { AUTH_HINT_KEY, startPromoStand } from './stand.mjs';
import { composeLayouts } from './compose.mjs';

const root = process.cwd();
const require = createRequire(join(root, 'package.json'));
const { chromium } = require('playwright-core');
const sharp = require('sharp');

const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

/** Site noise that never belongs in a promo shot. A shot can add its own `hide`. */
const NOISE = [
  '.support-prompt', '.page-tour-host', '.ui-tour', '.global-tour-button',
  '[class*="cookie" i]', '[class*="consent" i]', '[class*="banner-notice" i]',
  'nextjs-portal', '[data-nextjs-toast]',
];
const FREEZE_CSS = `*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important; animation-iteration-count: 1 !important;
  transition-duration: 0s !important; transition-delay: 0s !important; caret-color: transparent !important;
  scroll-behavior: auto !important; }`;

const { values: args } = parseArgs({ options: {
  config: { type: 'string' }, out: { type: 'string' }, origin: { type: 'string' }, only: { type: 'string' },
} });
if (!args.config || !args.out) {
  console.error('usage: shoot.mjs --config <shots.json> --out <folder> [--origin <url>] [--only id,id]');
  process.exit(2);
}
const config = JSON.parse(readFileSync(resolve(args.config), 'utf8'));
const only = args.only ? new Set(args.only.split(',')) : null;
const shots = config.shots.filter(shot => !only || only.has(shot.id));
const out = resolve(args.out);
mkdirSync(out, { recursive: true });

async function runAction(page, action) {
  if (action.click) return page.locator(action.click).first().click();
  if (action.hover) return page.locator(action.hover).first().hover();
  if (action.select) return page.locator(action.select).first().selectOption(action.value);
  if (action.fill) return page.locator(action.fill).first().fill(action.value);
  if (action.press) return page.keyboard.press(action.press);
  if (action.waitFor) return page.locator(action.waitFor).first().waitFor({ state: 'visible', timeout: 60_000 });
  if (action.scroll) return page.locator(action.scroll).first().scrollIntoViewIfNeeded();
  if (action.wait) return page.waitForTimeout(action.wait);
  throw new Error(`Unknown action ${JSON.stringify(action)}`);
}

/** Lazy images, fonts and late layout: scroll through the target, then wait for every image in it. */
async function settle(page, target, settleMs) {
  await page.evaluate(async selector => {
    const element = selector ? document.querySelector(selector) : document.body;
    if (!element) return;
    const { top, height } = element.getBoundingClientRect();
    const start = top + window.scrollY;
    for (let y = start; y < start + height; y += window.innerHeight / 2) {
      window.scrollTo(0, y);
      await new Promise(done => setTimeout(done, 120));
    }
    await document.fonts.ready;
    const images = [...element.querySelectorAll('img')];
    images.forEach(image => { image.loading = 'eager'; });
    await Promise.all(images.map(image => image.complete ? image.decode().catch(() => {})
      : new Promise(done => { image.onload = image.onerror = done; setTimeout(done, 15_000); })));
  }, target ?? null);
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(settleMs);
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

/**
 * A full-page capture renders the document from the top: a sticky or fixed
 * bar outside the target (search, filter toolbar) would land on the target
 * once the page was scrolled, so such bars are hidden and the page returns
 * to the top. Bars inside the target keep their natural place.
 */
async function releaseStickyBars(page, target) {
  await page.evaluate(selector => {
    const element = selector ? document.querySelector(selector) : null;
    for (const node of document.querySelectorAll('body *')) {
      const { position } = getComputedStyle(node);
      if (position !== 'fixed' && position !== 'sticky') continue;
      if (element && (element.contains(node) || node.contains(element))) continue;
      node.style.setProperty('visibility', 'hidden', 'important');
    }
    window.scrollTo(0, 0);
  }, target ?? null);
}

async function clipFor(page, shot) {
  if (shot.clip) return shot.clip;
  if (!shot.target) return null;
  const pad = shot.padding ?? 24;
  const box = await page.evaluate(({ selector, snap }) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const edges = (cells, side) => cells ? [...element.querySelectorAll(cells)]
      .map(cell => cell.getBoundingClientRect()[side] - rect[side === 'right' ? 'left' : 'top'])
      .filter(edge => edge > 0) : [];
    return { x: rect.left + window.scrollX, y: rect.top + window.scrollY, width: rect.width, height: rect.height,
      pageWidth: document.documentElement.scrollWidth,
      rowEdges: edges(snap?.rows, 'bottom'), columnEdges: edges(snap?.columns, 'right') };
  }, { selector: shot.target, snap: shot.snap });
  if (!box) throw new Error(`${shot.id}: target ${shot.target} not found`);
  const crop = { x: 0, y: 0, width: box.width, height: box.height, ...shot.crop };
  crop.width = Math.min(crop.width, box.width - crop.x);
  crop.height = Math.min(crop.height, box.height - crop.y);
  // Snap: end the crop on the last row/column that fits whole, never on a half-cut cell.
  const snapTo = (edges, start, size) => Math.max(0, ...edges.filter(edge => edge <= start + size + 0.5)) - start;
  if (box.rowEdges.length) crop.height = snapTo(box.rowEdges, crop.y, crop.height) || crop.height;
  if (box.columnEdges.length) crop.width = snapTo(box.columnEdges, crop.x, crop.width) || crop.width;
  const x = Math.max(0, box.x + crop.x - pad);
  const y = Math.max(0, box.y + crop.y - pad);
  return { x, y, width: Math.min(crop.width + pad * 2, box.pageWidth - x), height: crop.height + pad * 2 };
}

async function shoot(browser, origin, cookie, shot, rawName) {
  const context = await browser.newContext({
    viewport: shot.viewport ?? DEFAULT_VIEWPORT, deviceScaleFactor: shot.dpr ?? 2,
    reducedMotion: 'reduce', locale: 'ru-RU', colorScheme: 'light',
  });
  try {
    if (shot.access !== 'guest' && cookie) {
      await context.addCookies([{ ...cookie, url: origin }]);
      await context.addInitScript(key => localStorage.setItem(key, '1'), AUTH_HINT_KEY);
    }
    await context.addInitScript(() => localStorage.setItem('manacost:page-tours:auto-off', '1'));
    const page = await context.newPage();
    const problems = [];
    page.on('pageerror', error => problems.push(`pageerror ${error.message}`));
    page.on('response', response => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    await page.goto(new URL(shot.route, origin).href, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.addStyleTag({ content: FREEZE_CSS });
    if (shot.waitFor) await page.locator(shot.waitFor).first().waitFor({ state: 'visible', timeout: 90_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 }).catch(() => {});
    for (const action of shot.actions ?? []) await runAction(page, action);
    await page.addStyleTag({ content: `${[...NOISE, ...(shot.hide ?? [])].join(',\n')} { display: none !important; }` });
    await settle(page, shot.target, shot.settleMs ?? 800);
    for (const action of shot.after ?? []) await runAction(page, action);
    if (shot.target) await releaseStickyBars(page, shot.target);
    const clip = await clipFor(page, shot);
    const raw = join(out, `${rawName}-raw.png`);
    await page.screenshot({ path: raw, fullPage: Boolean(clip), clip: clip ?? undefined, animations: 'disabled' });
    return { raw, problems };
  } finally {
    await context.close();
  }
}

let stand = null;
let browser = null;
const stop = async () => {
  await browser?.close().catch(() => {});
  await stand?.close().catch(() => {});
};
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop().then(() => process.exit(130)));

const report = [];
try {
  stand = args.origin ? null : await startPromoStand({ root });
  const origin = args.origin ?? stand.origin;
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--hide-scrollbars'] });
  for (const shot of shots) {
    // A layout given as an object ({ "layout": "vk", "viewport": …, "crop": … }) gets its own capture,
    // e.g. a taller crop for the portrait format; plain layout names share the base capture.
    const shared = (shot.layouts ?? []).filter(entry => typeof entry === 'string');
    const captures = [{ name: shot.id, shot: { ...shot, layouts: shared } },
      ...(shot.layouts ?? []).filter(entry => typeof entry === 'object').map(({ layout, ...overrides }) => ({
        name: `${shot.id}-${layout}`, shot: { ...shot, ...overrides, layouts: [layout] } }))];
    for (const capture of captures) {
      try {
        const { raw, problems } = await shoot(browser, origin, stand?.cookie, capture.shot, capture.name);
        await sharp(raw).webp({ quality: 92 }).toFile(raw.replace(/\.png$/, '.webp'));
        const files = await composeLayouts(browser, root, out, capture.shot, raw, config.brand ?? {});
        report.push({ id: capture.name, raw, files, problems: problems.slice(0, 10) });
        console.log(`OK ${capture.name}: ${[raw, ...files].join(', ')}${problems.length ? `\n  problems: ${problems.slice(0, 5).join('; ')}` : ''}`);
      } catch (error) {
        report.push({ id: capture.name, error: error.message });
        console.log(`FAILED ${capture.name}: ${error.message.split('\n')[0]}`);
      }
    }
  }
} finally {
  await stop();
}
writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (report.some(entry => entry.error)) process.exitCode = 1;
