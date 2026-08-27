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
  log?: (message: string) => void;
};

const PUPPETEER_VERSION = '25.4.0';
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
  const configured = [
    ['PUPPETEER_EXECUTABLE_PATH', env.PUPPETEER_EXECUTABLE_PATH],
    ['CHROME_BIN', env.CHROME_BIN],
  ] as const;
  const explicit = configured
    .map(([name, value]) => [name, value?.trim()] as const)
    .find(([, value]) => Boolean(value));
  if (explicit) {
    const [name, executablePath] = explicit;
    if (executablePath && isExecutable(executablePath)) return executablePath;
    throw new Error(`[Scraper] Configured ${name} is not executable: ${executablePath}`);
  }

  const checked = [...new Set(candidates)];
  const executable = checked.find(candidate => isExecutable(candidate));
  if (executable) return executable;

  throw new Error(
    `[Scraper] No executable system Chrome found. Set PUPPETEER_EXECUTABLE_PATH or install a supported Chrome. Checked: ${checked.join(', ') || 'no paths'}`,
  );
}

function scraperBrowserCandidates(options: BrowserRuntimeOptions): { paths: string[]; explicit: boolean } {
  const env = options.env ?? process.env;
  const isExecutable = options.isExecutable ?? defaultIsExecutable;
  const explicit = [
    ['PUPPETEER_EXECUTABLE_PATH', env.PUPPETEER_EXECUTABLE_PATH],
    ['CHROME_BIN', env.CHROME_BIN],
  ] as const;
  const configured = explicit
    .map(([name, value]) => [name, value?.trim()] as const)
    .find(([, value]) => Boolean(value));
  if (configured) {
    const [name, executablePath] = configured;
    if (!executablePath || !isExecutable(executablePath)) {
      throw new Error(`[Scraper] Configured ${name} is not executable: ${executablePath}`);
    }
    return { paths: [executablePath], explicit: true };
  }

  const candidates = [...new Set(options.candidates ?? DEFAULT_BROWSER_EXECUTABLES)];
  const paths = candidates.filter(candidate => isExecutable(candidate));
  if (paths.length === 0) {
    throw new Error(
      `[Scraper] No executable system Chrome found. Set PUPPETEER_EXECUTABLE_PATH or install a supported Chrome. Checked: ${candidates.join(', ') || 'no paths'}`,
    );
  }
  return { paths, explicit: false };
}

function safeBrowserFailure(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return detail.replaceAll(/\s+/g, ' ').trim().slice(0, 300) || 'unknown browser failure';
}

async function selectScraperBrowser(
  options: BrowserRuntimeOptions,
  verify?: (browser: Browser) => Promise<void>,
): Promise<Browser> {
  const { paths, explicit } = scraperBrowserCandidates(options);
  const launch = options.launch ?? (launchOptions => puppeteer.launch(launchOptions));
  const log = options.log ?? (message => console.info(message));
  const failures: string[] = [];

  for (const executablePath of paths) {
    let browser: Browser | null = null;
    try {
      browser = await launch({
        browser: 'chrome',
        executablePath,
        headless: true,
        args: [...SCRAPER_BROWSER_ARGS],
      });
      const version = await browser.version();
      if (!/(?:Chrome|Chromium)\/\d+/.test(version)) {
        throw new Error(`browser returned an unsupported version identifier: ${version}`);
      }
      await verify?.(browser);
      log(`[Scraper] Browser runtime ready: puppeteer=${PUPPETEER_VERSION} browser=${version} executable=${executablePath}`);
      return browser;
    } catch (cause) {
      if (browser) await browser.close().catch(() => {});
      const detail = safeBrowserFailure(cause);
      failures.push(`${executablePath}: ${detail}`);
      if (explicit) break;
    }
  }

  throw new Error(`[Scraper] Failed to initialize a compatible system browser. ${failures.join('; ')}`);
}

export function launchScraperBrowser(options: BrowserRuntimeOptions = {}): Promise<Browser> {
  return selectScraperBrowser(options);
}

export async function verifyScraperBrowserRuntime(options: BrowserRuntimeOptions = {}): Promise<void> {
  const browser = await selectScraperBrowser(options, async candidate => {
    const page = await candidate.newPage();
    await page.goto(RUNTIME_SMOKE_PAGE);
    const title = await page.title();
    if (title !== 'hearthpulse-runtime-ok') {
      throw new Error(`[Scraper] Browser runtime smoke returned unexpected title: ${title}`);
    }
  });
  await browser.close();
}
