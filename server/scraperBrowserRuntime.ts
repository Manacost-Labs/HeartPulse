import { accessSync, constants } from 'node:fs';
import puppeteer, { type Browser, type LaunchOptions } from 'puppeteer-core';

const DEFAULT_BROWSER_EXECUTABLES = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
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
  try {
    return await launch({
      browser: 'chrome',
      executablePath,
      headless: true,
      args: [...SCRAPER_BROWSER_ARGS],
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`[Scraper] Failed to launch system Chrome at ${executablePath}: ${detail}`, { cause });
  }
}
