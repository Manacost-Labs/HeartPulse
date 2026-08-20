import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = (process.argv.find(argument => argument.startsWith('--url=')) || '--url=https://hearthpulse.net')
  .slice(6)
  .replace(/\/$/, '');
const outputDirectory = path.resolve('docs/screenshots');

await mkdir(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openHome(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle2', timeout: 45_000 });
  await page.waitForSelector('.home-stage');
  await page.waitForSelector('.home-latest-articles');
  await page.waitForSelector('.home-bg-directory');
  await page.waitForSelector('.home-arena-directory');
  await page.waitForSelector('#faq-heading');
  await page.addStyleTag({
    content: '.support-prompt { display: none !important; }',
  });
  return page;
}

async function warmImages(page) {
  await page.evaluate(async () => {
    const delay = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));
    const height = document.documentElement.scrollHeight;
    for (let position = 0; position < height; position += Math.max(320, window.innerHeight * 0.7)) {
      window.scrollTo(0, position);
      await delay(90);
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images]
    .filter(image => image.getBoundingClientRect().width > 0)
    .every(image => image.complete), { timeout: 15_000 });
}

try {
  const desktop = await openHome({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await warmImages(desktop);
  await desktop.screenshot({
    path: path.join(outputDirectory, 'home-desktop.png'),
    type: 'png',
  });

  await desktop.$eval('.home-latest-articles', element => element.scrollIntoView({ block: 'start' }));
  await new Promise(resolve => setTimeout(resolve, 300));
  await desktop.screenshot({
    path: path.join(outputDirectory, 'home-sections.png'),
    type: 'png',
  });
  await desktop.close();

  const mobile = await openHome({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await warmImages(mobile);
  await mobile.screenshot({
    path: path.join(outputDirectory, 'home-mobile.png'),
    type: 'png',
  });
  await mobile.close();

  console.log(`GitHub screenshots saved to ${outputDirectory}`);
} finally {
  await browser.close();
}
