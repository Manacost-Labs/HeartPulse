import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';
import { SHARE_IMAGE_HEIGHT, SHARE_IMAGE_SECTIONS, SHARE_IMAGE_WIDTH } from '../shared/shareImages.ts';
import { SHARE_IMAGE_CONTENT } from './share-images/sections.mjs';
import { shareImageHtml } from './share-images/template.mjs';

/*
 * Renders the link-preview images into public/assets/og/hearthpulse-<section>.png
 * from the HTML template and the site's own public assets. After changing the
 * template or copy, run `npm run render:share-images`, review the PNGs, bump
 * SHARE_IMAGE_VERSION in shared/shareImages.ts and commit both.
 * `--only=<section>` renders one section; CHROMIUM_PATH overrides the browser.
 */

const PUBLIC = path.resolve('public');
const OUTPUT = path.join(PUBLIC, 'assets/og');
const MAX_BYTES = 300 * 1024;
const TYPES = { '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7);
const sections = only ? SHARE_IMAGE_SECTIONS.filter(section => section === only) : SHARE_IMAGE_SECTIONS;
if (!sections.length) throw new Error(`Unknown share image section: ${only}`);

const pages = new Map(sections.map(section => [`/__share/${section}`, shareImageHtml(SHARE_IMAGE_CONTENT[section])]));

// Serves only the template pages and files under public/; the browser never leaves 127.0.0.1.
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
  const page = pages.get(pathname);
  if (page) {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
    return;
  }
  const file = path.join(PUBLIC, pathname);
  const type = TYPES[path.extname(file)];
  if (!file.startsWith(`${PUBLIC}${path.sep}`) || !type) {
    response.writeHead(404).end();
    return;
  }
  try {
    response.writeHead(200, { 'content-type': type }).end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
});

try {
  await mkdir(OUTPUT, { recursive: true });
  const page = await browser.newPage();
  await page.setViewport({ width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT, deviceScaleFactor: 1 });
  const failedRequests = [];
  page.on('response', response => {
    if (!response.ok() && !response.url().endsWith('/favicon.ico')) failedRequests.push(response.url());
  });
  for (const section of sections) {
    await page.goto(`${origin}/__share/${section}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    if (failedRequests.length) throw new Error(`Missing assets for ${section}: ${failedRequests.join(', ')}`);
    const screenshot = await page.screenshot({ type: 'png' });
    // A 256-colour palette keeps the parchment texture under the size budget without visible banding.
    const png = await sharp(screenshot).png({ palette: true, colours: 256, quality: 92, dither: 0.6, effort: 10 }).toBuffer();
    if (png.length > MAX_BYTES) throw new Error(`${section}: ${png.length} bytes exceeds the ${MAX_BYTES} byte budget`);
    const target = path.join(OUTPUT, `hearthpulse-${section}.png`);
    await writeFile(target, png);
    console.log(`${path.relative(process.cwd(), target)} ${(png.length / 1024).toFixed(0)} KiB`);
  }
} finally {
  await browser.close();
  server.close();
}
