import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

import puppeteer from 'puppeteer-core';

function probeError(code, stage, message) {
  const error = new Error(message);
  error.code = code;
  error.stage = stage;
  return error;
}

function chromeExecutable(explicitPath) {
  const candidate = [
    explicitPath,
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].find(value => value && existsSync(value));
  if (!candidate) throw probeError('BROWSER_MISSING', 'browser', 'Chromium or Chrome executable is required');
  return candidate;
}

function safeSameOriginPath(value, origin) {
  try {
    const parsed = new URL(value);
    return parsed.origin === origin ? parsed.pathname : '';
  } catch {
    return '';
  }
}

function visibleCountScript(selector) {
  const visible = element => {
    if (!(element instanceof HTMLElement)) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  return [...document.querySelectorAll(selector)].filter(visible).length;
}

async function withTimeout(operation, timeoutMs, timeoutError) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(timeoutError()), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export async function createBrowserProbe(options) {
  const origin = new URL(options.baseUrl).origin;
  const browser = await (options.puppeteerImpl || puppeteer).launch({
    headless: true,
    executablePath: chromeExecutable(options.executablePath),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  if (options.authCookie) {
    // Page.setCookie remains available in the oldest supported Puppeteer
    // runtime on the production host. The browser itself is dedicated to this
    // observer run, so its default context is still isolated from other work.
    await page.setCookie({
      name: 'manacost_auth_token',
      value: options.authCookie,
      url: origin,
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'Lax',
    });
  }
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  page.setDefaultNavigationTimeout(options.navigationTimeoutMs);
  page.setDefaultTimeout(options.semanticTimeoutMs);

  let runtimeFailures = [];
  page.on('pageerror', () => runtimeFailures.push({ code: 'PAGE_ERROR', message: 'unhandled page error' }));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (/Failed to load resource|ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
    runtimeFailures.push({ code: 'CONSOLE_ERROR', message: 'browser console error' });
  });
  page.on('response', response => {
    const requestPath = safeSameOriginPath(response.url(), origin);
    const authenticationFailure = options.authCookie && [401, 403].includes(response.status());
    if (!requestPath.startsWith('/api/') || (response.status() < 500 && !authenticationFailure)) return;
    runtimeFailures.push({
      code: authenticationFailure ? 'API_AUTH_STATUS' : 'API_HTTP_STATUS',
      message: `${requestPath} returned HTTP ${response.status()}`,
    });
  });
  page.on('requestfailed', request => {
    const requestPath = safeSameOriginPath(request.url(), origin);
    if (!requestPath.startsWith('/api/')) return;
    if (requestPath === '/api/telemetry/web-vitals' && request.failure()?.errorText === 'net::ERR_ABORTED') return;
    runtimeFailures.push({ code: 'API_REQUEST_FAILED', message: `${requestPath} request failed` });
  });

  async function savePublicScreenshot(checkId) {
    if (!options.screenshotDirectory || options.authCookie) return;
    try {
      if (new URL(page.url()).origin !== origin) return;
    } catch {
      return;
    }
    mkdirSync(options.screenshotDirectory, { recursive: true });
    await page.screenshot({
      path: path.join(options.screenshotDirectory, `${checkId}.png`),
      fullPage: false,
    }).catch(() => {});
  }

  async function verifyAuthenticatedSession() {
    const authenticationUrl = new URL('/api/auth/me', origin).href;
    const timeoutError = () => probeError(
      'AUTH_SESSION_TIMEOUT',
      'authentication',
      'synthetic authentication verification timed out',
    );
    const state = await withTimeout(
      page.evaluate(async ({ url, timeoutMs }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          const payload = await response.json();
          return { status: response.status, authenticated: Boolean(payload?.user), timedOut: false };
        } catch {
          return { status: 0, authenticated: false, timedOut: controller.signal.aborted };
        } finally {
          clearTimeout(timeout);
        }
      }, { url: authenticationUrl, timeoutMs: options.semanticTimeoutMs }),
      options.semanticTimeoutMs + 250,
      timeoutError,
    );
    if (state.timedOut) throw timeoutError();
    if (state.status !== 200 || !state.authenticated) {
      throw probeError('AUTH_SESSION_REJECTED', 'authentication', 'synthetic authentication session was rejected');
    }
  }

  let sessionVerified = false;
  async function navigate(target) {
    try {
      return await page.goto(target.href, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      return page.goto(target.href, { waitUntil: 'domcontentloaded' });
    }
  }

  const probe = async check => {
    runtimeFailures = [];
    const target = new URL(check.path, origin);
    if (check.query) target.search = `?${check.query}`;
    try {
      const response = await navigate(target);
      if (!response) throw probeError('NO_DOCUMENT_RESPONSE', 'navigation', 'navigation returned no document response');
      if (new URL(page.url()).origin !== origin) {
        throw probeError('CROSS_ORIGIN_REDIRECT', 'navigation', 'document redirected outside the observed origin');
      }
      if (response.status() !== 200) {
        throw probeError('HTTP_STATUS', 'navigation', `document returned HTTP ${response.status()}`);
      }
      if (options.authCookie && !sessionVerified) {
        await verifyAuthenticatedSession();
        sessionVerified = true;
      }
      for (const assertion of check.assertions) {
        await page.waitForSelector(assertion.selector, {
          visible: true,
          timeout: options.semanticTimeoutMs,
          signal: options.signal,
        });
        const count = await page.evaluate(visibleCountScript, assertion.selector);
        if (count < assertion.minCount) {
          throw probeError('SEMANTIC_COUNT', 'semantic',
            `${assertion.selector} rendered ${count}; expected at least ${assertion.minCount}`);
        }
      }
      for (const selector of check.forbiddenSelectors || []) {
        const count = await page.evaluate(visibleCountScript, selector);
        if (count > 0) throw probeError('FORBIDDEN_STATE', 'semantic', `${selector} must not be visible`);
      }
      const appErrorCount = await page.evaluate(visibleCountScript, '[data-app-error], .app-error-card');
      if (appErrorCount > 0) throw probeError('APP_ERROR_STATE', 'semantic', 'application error state is visible');
      if (runtimeFailures.length > 0) {
        const first = runtimeFailures[0];
        throw probeError(first.code, 'runtime', first.message);
      }
    } catch (error) {
      await savePublicScreenshot(check.id);
      if (error?.code) throw error;
      if (options.signal?.aborted) throw probeError('RUN_DEADLINE', 'deadline', 'observer run deadline exceeded');
      if (runtimeFailures.length > 0) {
        const first = runtimeFailures[0];
        throw probeError(first.code, 'runtime', first.message);
      }
      throw probeError('BROWSER_CHECK_FAILED', 'browser', error?.message || 'browser check failed');
    }
  };

  const close = async () => {
    await browser.close().catch(() => {});
  };
  return { probe, close };
}
