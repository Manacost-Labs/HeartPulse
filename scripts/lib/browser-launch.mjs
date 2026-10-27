import puppeteer, { TimeoutError } from 'puppeteer';

// A busy GitHub-hosted runner sometimes needs more than Puppeteer's default
// 30 s before Chrome prints its DevTools endpoint; a second start succeeds.
const LAUNCH_TIMEOUT_MS = 60_000;

/**
 * `puppeteer.launch` for browser tests and QA scripts. A start that timed out
 * waiting for the DevTools endpoint is tried once more; every other launch
 * error, and a second timeout, is thrown as is.
 */
export async function launchBrowser(options = {}) {
  const launchOptions = { timeout: LAUNCH_TIMEOUT_MS, ...options };
  try {
    return await puppeteer.launch(launchOptions);
  } catch (error) {
    if (!(error instanceof TimeoutError) || !/WS endpoint/.test(error.message)) throw error;
    console.warn(`[browser] ${error.message}; starting the browser once more`);
    return puppeteer.launch(launchOptions);
  }
}
