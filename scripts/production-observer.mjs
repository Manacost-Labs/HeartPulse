import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { createBrowserProbe } from './production-observer/browser-probe.mjs';
import {
  ObserverConfigurationError,
  ObserverRunFailure,
  normalizeObserverBaseUrl,
  publicRoutePaths,
  runObserverChecks,
  sanitizeDiagnostic,
  validateObserverConfig,
} from './production-observer/core.mjs';
import { createHttpRouteProbe } from './production-observer/http-probe.mjs';

const DEFAULT_BASE_URL = 'https://hearthpulse.net';

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), 'utf8'));
}

function createRunId() {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

function writeJsonAtomic(target, value) {
  const temporary = `${target}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, target);
}

function launchFailureProbe(error) {
  return async () => {
    const wrapped = new Error(error?.message || 'browser could not start');
    wrapped.code = error?.code || 'BROWSER_LAUNCH_FAILED';
    wrapped.stage = error?.stage || 'browser';
    throw wrapped;
  };
}

export async function runProductionObserver(options = {}) {
  const config = options.config || readJson('../config/production-observer.json');
  validateObserverConfig(config);
  const routeDocument = options.routeDocument || readJson('../config/public-seo-pages.json');
  const routes = publicRoutePaths(routeDocument);
  const profile = String(options.profile || 'public').trim().toLowerCase();
  const baseUrl = normalizeObserverBaseUrl(options.baseUrl || DEFAULT_BASE_URL);
  const runId = options.runId || createRunId();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(runId)) {
    throw new Error('observer runId is invalid');
  }
  const outputRoot = path.resolve(options.outputRoot || path.join('/tmp', 'hearthpulse-production-observer'));
  const outputDirectory = path.join(outputRoot, runId);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const eventsPath = path.join(outputDirectory, 'events.jsonl');
  const summaryPath = path.join(outputDirectory, 'summary.json');
  const eventSink = event => {
    const line = `${JSON.stringify(event)}\n`;
    appendFileSync(eventsPath, line, { mode: 0o600 });
    (options.console || console).log(line.trimEnd());
  };

  if (!['public', 'authenticated'].includes(profile)
    || (profile === 'authenticated'
      && (typeof options.authCookie !== 'string'
        || options.authCookie.length === 0
        || options.authCookie.length > 4_096
        || /[\u0000-\u001f\u007f]/.test(options.authCookie)))) {
    const message = profile === 'authenticated'
      ? 'PRODUCTION_OBSERVER_AUTH_COOKIE is required for the authenticated profile'
      : `unsupported observer profile: ${profile}`;
    const failure = { code: 'CONFIGURATION_ERROR', stage: 'configuration', message };
    const report = {
      schemaVersion: 1,
      runId,
      profile,
      status: 'error',
      counts: { total: 0, passed: 0, failed: 1 },
      results: [],
      failures: [{ checkId: 'observer-configuration', scope: 'runner', path: '/', ...failure }],
    };
    eventSink({
      schemaVersion: 1,
      runId,
      sequence: 1,
      timestamp: new Date().toISOString(),
      profile,
      event: 'run_finished',
      status: 'error',
      counts: report.counts,
      failures: report.failures,
    });
    writeJsonAtomic(summaryPath, report);
    const error = new ObserverConfigurationError(message);
    error.code = 'CONFIGURATION_ERROR';
    error.outputDirectory = outputDirectory;
    throw error;
  }

  const deadlineController = new AbortController();
  const deadline = setTimeout(() => {
    const error = new Error(`observer run deadline exceeded after ${config.runDeadlineMs}ms`);
    error.code = 'RUN_DEADLINE';
    error.stage = 'deadline';
    deadlineController.abort(error);
  }, config.runDeadlineMs);
  let browser = { probe: async () => {}, close: async () => {} };
  let report;
  try {
    try {
      browser = await (options.createBrowserProbe || createBrowserProbe)({
        baseUrl,
        authCookie: options.authCookie,
        navigationTimeoutMs: config.navigationTimeoutMs,
        semanticTimeoutMs: config.semanticTimeoutMs,
        screenshotDirectory: path.join(outputDirectory, 'screenshots'),
        signal: deadlineController.signal,
        executablePath: options.executablePath,
      });
    } catch (error) {
      browser = { probe: launchFailureProbe(error), close: async () => {} };
    }
    const routeProbe = options.routeProbe || createHttpRouteProbe({
      baseUrl,
      timeoutMs: config.navigationTimeoutMs,
      signal: deadlineController.signal,
      fetchImpl: options.fetchImpl,
    });
    try {
      report = await runObserverChecks({
        config,
        publicRoutes: routes,
        profile,
        baseUrl,
        authCookie: options.authCookie,
        routeProbe,
        browserProbe: browser.probe,
        onEvent: eventSink,
        runId,
        signal: deadlineController.signal,
      });
    } catch (error) {
      if (!(error instanceof ObserverRunFailure)) throw error;
      report = error.report;
      writeJsonAtomic(summaryPath, report);
      error.outputDirectory = outputDirectory;
      throw error;
    }
    writeJsonAtomic(summaryPath, report);
    return { report, outputDirectory };
  } finally {
    clearTimeout(deadline);
    await browser.close();
  }
}

async function main() {
  try {
    const result = await runProductionObserver({
      baseUrl: process.env.PRODUCTION_BASE_URL,
      profile: process.env.PRODUCTION_OBSERVER_PROFILE,
      authCookie: process.env.PRODUCTION_OBSERVER_AUTH_COOKIE,
      outputRoot: process.env.PRODUCTION_OBSERVER_OUTPUT_ROOT,
      executablePath: process.env.CHROMIUM_PATH,
    });
    console.log(`[production-observer] report=${path.join(result.outputDirectory, 'summary.json')}`);
  } catch (error) {
    const diagnostic = {
      status: 'error',
      code: error?.code || error?.name || 'OBSERVER_FAILED',
      message: sanitizeDiagnostic(error?.message || error),
      outputDirectory: error?.outputDirectory,
    };
    console.error(`[production-observer] ${JSON.stringify(diagnostic)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
