#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'https://arena.hs-manacost.ru';
const DEFAULT_ROUTES = ['/', '/classes', '/battlegrounds/tier-list'];
const REQUIRED_DATASETS = ['winrates', 'tierlist', 'legendaries'];

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'hs-arena-external-monitor/1.0' },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function retryCheck(label, check, attempts, retryDelayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await check();
      return { label, attempts: attempt, ...result };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(retryDelayMs);
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function checkJsonEndpoint(baseUrl, path, fetchImpl, timeoutMs, validate) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(new URL(path, baseUrl), fetchImpl, timeoutMs);
  ensure(response.status === 200, `HTTP ${response.status}`);
  ensure((response.headers.get('cache-control') || '').includes('no-store'), 'missing Cache-Control: no-store');
  const payload = await response.json();
  validate(payload);
  return { status: response.status, durationMs: Date.now() - startedAt };
}

async function checkHtmlRoute(baseUrl, path, fetchImpl, timeoutMs) {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(new URL(path, baseUrl), fetchImpl, timeoutMs);
  ensure(response.status === 200, `HTTP ${response.status}`);
  ensure((response.headers.get('content-type') || '').includes('text/html'), 'response is not HTML');
  const body = await response.text();
  ensure(/<html[\s>]/i.test(body), 'HTML document marker is missing');
  ensure(!/application error|internal server error/i.test(body), 'error document returned');
  return { status: response.status, durationMs: Date.now() - startedAt };
}

export async function runProductionMonitor(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number(options.timeoutMs || 10_000);
  const attempts = Number(options.attempts || 2);
  const retryDelayMs = Number(options.retryDelayMs ?? 5_000);
  const routes = options.routes || DEFAULT_ROUTES;
  const checks = [];

  checks.push(await retryCheck('liveness', () => checkJsonEndpoint(
    baseUrl,
    '/api/health/live',
    fetchImpl,
    timeoutMs,
    payload => {
      ensure(payload?.status === 'alive', 'status is not alive');
      ensure(/^[a-f0-9]{7,40}$/i.test(String(payload?.release || '')), 'release SHA is missing');
    },
  ), attempts, retryDelayMs));

  checks.push(await retryCheck('readiness', () => checkJsonEndpoint(
    baseUrl,
    '/api/health/ready',
    fetchImpl,
    timeoutMs,
    payload => {
      ensure(payload?.status === 'ready', 'status is not ready');
      ensure(payload?.dataStatus === 'ok', `data status is ${String(payload?.dataStatus)}`);
    },
  ), attempts, retryDelayMs));

  checks.push(await retryCheck('data freshness', () => checkJsonEndpoint(
    baseUrl,
    '/api/health/data',
    fetchImpl,
    timeoutMs,
    payload => {
      ensure(payload?.status === 'ok' && payload?.fresh === true, 'datasets are not fresh');
      const datasets = Array.isArray(payload?.datasets) ? payload.datasets : [];
      for (const name of REQUIRED_DATASETS) {
        const dataset = datasets.find(item => item?.name === name);
        ensure(dataset?.state === 'fresh', `${name} is not fresh`);
        ensure(Number(dataset?.records) > 0, `${name} is empty`);
      }
    },
  ), attempts, retryDelayMs));

  for (const route of routes) {
    checks.push(await retryCheck(
      `page ${route}`,
      () => checkHtmlRoute(baseUrl, route, fetchImpl, timeoutMs),
      attempts,
      retryDelayMs,
    ));
  }

  return {
    status: 'ok',
    baseUrl,
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function main() {
  try {
    const report = await runProductionMonitor({
      baseUrl: process.env.PRODUCTION_BASE_URL,
      timeoutMs: process.env.MONITOR_TIMEOUT_MS,
      attempts: process.env.MONITOR_ATTEMPTS,
      retryDelayMs: process.env.MONITOR_RETRY_DELAY_MS,
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`[production-monitor] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
