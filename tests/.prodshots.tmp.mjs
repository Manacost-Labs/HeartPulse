import { launchBrowser } from '../scripts/lib/browser-launch.mjs';
const [url, out, prefix] = process.argv.slice(2);
const browser = await launchBrowser({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
for (const [w, h] of [[1440, 900], [412, 915]]) {
  await page.setViewport({ width: w, height: h, isMobile: w < 600, hasTouch: w < 600 });
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.screenshot({ path: `${out}/${prefix}-${w}-top.png` });
  await page.screenshot({ path: `${out}/${prefix}-${w}-full.png`, fullPage: true });
}
await browser.close();
