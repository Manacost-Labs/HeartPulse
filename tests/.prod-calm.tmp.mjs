import puppeteer from 'puppeteer';
const [out, prefix, url] = process.argv.slice(2);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [w, h] of [[1440, 900], [412, 915]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => document.querySelector('.donation-toast, [class*="support"] button[aria-label*="Закрыть"]')?.click());
  await page.screenshot({ path: `${out}/${prefix}-${w}-full.png`, fullPage: true });
  await page.click('#radar-panel > .radar-list > li:first-child .radar-candidate__more > summary');
  await new Promise(r => setTimeout(r, 300));
  const box = await page.$eval('#radar-panel > .radar-list > li:first-child .radar-candidate', n => { const r = n.getBoundingClientRect(); return { y: r.top + scrollY, h: r.height }; });
  await page.screenshot({ path: `${out}/${prefix}-${w}-open.png`, clip: { x: 0, y: box.y, width: w, height: Math.min(box.h, 3200) } });
}
await browser.close();
