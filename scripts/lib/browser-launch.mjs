import puppeteer, { TimeoutError } from 'puppeteer';
import { basename } from 'node:path';

// A busy GitHub-hosted runner sometimes needs more than Puppeteer's default
// 30 s before Chrome prints its DevTools endpoint; a second start succeeds.
const LAUNCH_TIMEOUT_MS = 60_000;

/**
 * `puppeteer.launch` for browser tests and QA scripts. A start that timed out
 * waiting for the DevTools endpoint is tried once more; every other launch
 * error, and a second timeout, is thrown as is.
 */
export async function launchBrowser(options = {}) {
  // CI uses the native DevTools pipe instead of waiting for a logged WS URL.
  // Explicit transport/port options and standalone defaults remain available.
  const launchOptions = {
    timeout: LAUNCH_TIMEOUT_MS,
    ...(process.env.GITHUB_ACTIONS === 'true' && options.debuggingPort === undefined ? { pipe: true } : {}),
    ...options,
  };
  const reportTiming = process.env.GITHUB_ACTIONS === 'true' || process.env.HP_BROWSER_TIMINGS === '1';
  const entry = basename(process.argv[1] || 'unknown');
  const launch = async attempt => {
    const started = performance.now();
    let outcome = 'failed';
    if (reportTiming) console.log(`[browser] launch-start entry=${entry} pid=${process.pid} attempt=${attempt} transport=${launchOptions.pipe ? 'pipe' : 'websocket'}`);
    try {
      const browser = await puppeteer.launch(launchOptions);
      if (reportTiming) {
        const close = browser.close.bind(browser);
        browser.close = async (...args) => {
          const closing = performance.now();
          console.log(`[browser] close-start entry=${entry} pid=${process.pid} attempt=${attempt}`);
          try {
            return await close(...args);
          } finally {
            console.log(`[browser] close-end entry=${entry} pid=${process.pid} attempt=${attempt} milliseconds=${Math.round(performance.now() - closing)}`);
          }
        };
      }
      outcome = 'ready';
      return browser;
    } finally {
      if (reportTiming) console.log(`[browser] launch-end entry=${entry} pid=${process.pid} attempt=${attempt} outcome=${outcome} milliseconds=${Math.round(performance.now() - started)}`);
    }
  };
  try {
    return await launch(1);
  } catch (error) {
    if (!(error instanceof TimeoutError) || !/WS endpoint/.test(error.message)) throw error;
    console.warn(`[browser] ${error.message}; starting the browser once more`);
    return launch(2);
  }
}

/** Path of the Chrome that Puppeteer downloaded, for tests that look for a browser before launching one. */
export function downloadedBrowserPath() {
  return puppeteer.executablePath();
}
