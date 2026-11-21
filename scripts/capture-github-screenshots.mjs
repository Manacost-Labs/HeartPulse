import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const baseUrl = (process.argv.find(argument => argument.startsWith('--url=')) || '--url=https://hearthpulse.net')
  .slice(6)
  .replace(/\/$/, '');
const outputDirectory = path.resolve('docs/screenshots');

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

// A fresh browser profile is a guest: the README shows what a visitor sees, paid values under locks.
// `ready` is visible text that appears only after the page has its data; `scrollTo` starts the frame at a heading.
const SHOTS = [
  { name: 'home', path: '/', ready: ['Подборка статей'] },
  { name: 'matchups', path: '/standard/matchups/', ready: ['Полная матрица', 'Против меты'], scrollTo: 'Матчапы · Стандарт' },
  {
    name: 'card',
    path: '/standard/cards/standard/BE_036/',
    ready: ['Статистика', 'Изменения по патчам'],
    desktop: { ...DESKTOP, height: 1500 },
  },
  { name: 'assemble', path: '/standard/assemble/', ready: ['Данные HSReplay', 'Пул '] },
];

await mkdir(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.CHROME_BIN || '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function openPage(shot, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'networkidle2', timeout: 45_000 });
  await page.waitForFunction(texts => texts.every(text => document.body.innerText.includes(text)),
    { timeout: 30_000 }, shot.ready);
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
  // The closed mode switch keeps its lazy banners unloaded, so only images a visitor can see are awaited.
  await page.waitForFunction(() => [...document.images]
    .filter(image => image.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }))
    .every(image => image.complete), { timeout: 15_000 });
}

async function scrollToHeading(page, text) {
  await page.evaluate(heading => {
    const target = [...document.querySelectorAll('h1, h2, h3')].find(element => element.textContent.includes(heading));
    if (!target) throw new Error(`heading not found: ${heading}`);
    // Clear the sticky top bar: the search row on desktop, the logo row on a phone.
    target.style.scrollMarginTop = window.innerWidth < 700 ? '76px' : '68px';
    target.scrollIntoView({ block: 'start' });
  }, text);
  await new Promise(resolve => setTimeout(resolve, 400));
}

async function capture(shot, variant, viewport) {
  const page = await openPage(shot, viewport);
  try {
    await warmImages(page);
    if (shot.scrollTo) await scrollToHeading(page, shot.scrollTo);
    await page.screenshot({
      path: path.join(outputDirectory, `${shot.name}-${variant}.webp`),
      type: 'webp',
      quality: 86,
    });
  } finally {
    await page.close();
  }
}

try {
  for (const shot of SHOTS) {
    await capture(shot, 'desktop', shot.desktop ?? DESKTOP);
    await capture(shot, 'mobile', MOBILE);
  }
  console.log(`GitHub screenshots saved to ${outputDirectory}`);
} finally {
  await browser.close();
}
