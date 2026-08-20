// Screenshot QA — see design.md "QA Checklist".
// Renders key pages at desktop (1440px) and mobile (390px), saves screenshots
// to screenshot/qa/, and fails (exit 1) on layout regressions:
//   - horizontal scroll on mobile
//   - mobile burger menu not opening / links not visible / not closing on tap
//
// Usage:
//   npm run qa:screens                       # against production
//   node scripts/screenshot-qa.mjs --url=http://localhost:3000
import puppeteer from 'puppeteer';
import { mkdirSync } from 'fs';

const BASE = (process.argv.find(a => a.startsWith('--url=')) || '--url=https://hearthpulse.net').slice(6).replace(/\/$/, '');
const OUT = 'screenshot/qa';
const PAGES = ['/', '/tierlist', '/legendaries', '/classes'];
const failures = [];

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const slug = p => (p === '/' ? 'home' : p.replace(/\//g, '-').replace(/^-/, ''));

for (const path of PAGES) {
  for (const [device, vp] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    try {
      await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 45000 });
      await new Promise(r => setTimeout(r, 1200));
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      if (device === 'mobile' && scrollWidth > clientWidth) {
        failures.push(`${path} [mobile]: horizontal scroll (${scrollWidth} > ${clientWidth})`);
      }
      await page.screenshot({ path: `${OUT}/${slug(path)}-${device}.png` });
      console.log(`✓ ${path} [${device}]`);
    } catch (err) {
      failures.push(`${path} [${device}]: ${err.message}`);
    }
    await page.close();
  }
}

// Mobile menu smoke test on the home page
{
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  try {
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1200));
    const toggle = await page.$('.arena-mobile-nav-toggle');
    if (!toggle) throw new Error('burger toggle not found');
    const box = await toggle.boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise(r => setTimeout(r, 600));
    const state = await page.evaluate(() => {
      const menu = document.querySelector('.arena-mobile-menu');
      if (!menu) return { open: false };
      const links = [...menu.querySelectorAll('a')];
      const visible = links.filter(a => {
        const r = a.getBoundingClientRect();
        return r.width > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
      });
      return { open: true, total: links.length, visible: visible.length, top: Math.round(menu.getBoundingClientRect().top) };
    });
    if (!state.open) throw new Error('menu did not open after tap');
    if (state.visible === 0) throw new Error(`menu opened at top=${state.top} but no links are visible in the viewport`);
    await page.screenshot({ path: `${OUT}/home-mobile-menu-open.png` });
    const link = await page.evaluate(() => {
      const a = document.querySelector('.arena-mobile-menu a');
      const r = a.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.touchscreen.tap(link.x, link.y);
    await new Promise(r => setTimeout(r, 800));
    const stillOpen = await page.evaluate(() => !!document.querySelector('.arena-mobile-menu'));
    if (stillOpen) throw new Error('menu did not close after tapping a link');
    console.log(`✓ mobile menu: opens (${state.visible}/${state.total} links visible), closes on tap`);
  } catch (err) {
    failures.push(`mobile menu: ${err.message}`);
  }
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error('\nQA FAILURES:');
  failures.forEach(f => console.error('  ✗ ' + f));
  process.exit(1);
}
console.log(`\nAll checks passed. Screenshots in ${OUT}/`);
