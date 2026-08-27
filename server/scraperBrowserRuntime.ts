import { accessSync, constants } from 'node:fs';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer-core';

const DEFAULT_BROWSER_EXECUTABLES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
] as const;

const SCRAPER_BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
] as const;

type BrowserEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'CHROME_BIN' | 'PUPPETEER_EXECUTABLE_PATH'>>;
type BrowserLauncher = (options: LaunchOptions) => Promise<Browser>;

type BrowserRuntimeOptions = {
  env?: BrowserEnvironment;
  candidates?: readonly string[];
  isExecutable?: (path: string) => boolean;
  launch?: BrowserLauncher;
};

const PUPPETEER_VERSION = '25.4.0';
const SUPPORTED_BROWSER_MAJOR = 151;
const RUNTIME_SMOKE_PAGE = 'data:text/html,<title>hearthpulse-runtime-ok</title>';

function defaultIsExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveScraperBrowserExecutable(
  options: Omit<BrowserRuntimeOptions, 'launch'> = {},
): string {
  const env = options.env ?? process.env;
  const candidates = options.candidates ?? DEFAULT_BROWSER_EXECUTABLES;
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const configured = [env.PUPPETEER_EXECUTABLE_PATH, env.CHROME_BIN]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
  const checked = [...new Set([...configured, ...candidates])];
  const executable = checked.find(isExecutable);
  if (executable) return executable;

  throw new Error(
    `[Scraper] No executable system Chrome found. Set PUPPETEER_EXECUTABLE_PATH or install a supported Chrome. Checked: ${checked.join(', ') || 'no paths'}`,
  );
}

export async function launchScraperBrowser(options: BrowserRuntimeOptions = {}): Promise<Browser> {
  const executablePath = resolveScraperBrowserExecutable(options);
  const launch = options.launch ?? (launchOptions => puppeteer.launch(launchOptions));
  let browser: Browser | null = null;
  try {
    browser = await launch({
      browser: 'chrome',
      executablePath,
      headless: true,
      args: [...SCRAPER_BROWSER_ARGS],
    });
    const version = await browser.version();
    const major = Number(version.match(/(?:Chrome|Chromium)\/(\d+)/)?.[1]);
    if (major !== SUPPORTED_BROWSER_MAJOR) {
      throw new Error(
        `Puppeteer ${PUPPETEER_VERSION} requires Chrome/Chromium ${SUPPORTED_BROWSER_MAJOR}; received ${version}`,
      );
    }
    return browser;
  } catch (cause) {
    if (browser) await browser.close().catch(() => {});
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`[Scraper] Failed to initialize system browser at ${executablePath}: ${detail}`, { cause });
  }
}

export async function verifyScraperBrowserRuntime(options: BrowserRuntimeOptions = {}): Promise<void> {
  const browser = await launchScraperBrowser(options);
  try {
    const page = await browser.newPage();
    await page.goto(RUNTIME_SMOKE_PAGE);
    const title = await page.title();
    if (title !== 'hearthpulse-runtime-ok') {
      throw new Error(`[Scraper] Browser runtime smoke returned unexpected title: ${title}`);
    }
  } finally {
    await browser.close();
  }
}
