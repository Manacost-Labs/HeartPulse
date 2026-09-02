import { randomUUID } from 'node:crypto';

const CHECK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_MESSAGE_LENGTH = 400;

export class ObserverConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ObserverConfigurationError';
  }
}

export class ObserverRunFailure extends Error {
  constructor(report) {
    super(`Production observer failed (${report.counts.failed}/${report.counts.total} checks)`);
    this.name = 'ObserverRunFailure';
    this.report = report;
  }
}

function ensureConfiguration(condition, message) {
  if (!condition) throw new ObserverConfigurationError(message);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validatePath(value, label) {
  ensureConfiguration(typeof value === 'string' && value.startsWith('/'), `${label} must start with /`);
  ensureConfiguration(!value.includes('?') && !value.includes('#'), `${label} must not contain query or fragment`);
  ensureConfiguration(!value.includes('\\') && !value.includes('\0'), `${label} contains unsafe characters`);
  const parsed = new URL(value, 'https://observer.invalid');
  ensureConfiguration(parsed.origin === 'https://observer.invalid' && parsed.pathname === value,
    `${label} must be a normalized path`);
}

function validateAssertion(assertion, label) {
  ensureConfiguration(isRecord(assertion), `${label} must be an object`);
  ensureConfiguration(typeof assertion.selector === 'string'
    && assertion.selector.length > 0
    && assertion.selector.length <= 240,
  `${label} selector is invalid`);
  ensureConfiguration(Number.isInteger(assertion.minCount)
    && assertion.minCount > 0
    && assertion.minCount <= 10_000,
  `${label} minCount is invalid`);
}

export function validateObserverConfig(config) {
  ensureConfiguration(isRecord(config), 'observer configuration must be an object');
  ensureConfiguration(config.schemaVersion === 1, 'observer schemaVersion must be 1');
  for (const field of ['navigationTimeoutMs', 'semanticTimeoutMs', 'runDeadlineMs']) {
    ensureConfiguration(Number.isInteger(config[field]) && config[field] >= 100 && config[field] <= 600_000,
      `${field} is invalid`);
  }
  ensureConfiguration(isRecord(config.profiles), 'profiles must be an object');
  const ids = new Set();
  for (const profile of ['public', 'authenticated']) {
    const checks = config.profiles[profile];
    ensureConfiguration(Array.isArray(checks) && checks.length > 0, `${profile} profile must contain checks`);
    for (const [index, check] of checks.entries()) {
      const label = `${profile} check ${index}`;
      ensureConfiguration(isRecord(check), `${label} must be an object`);
      ensureConfiguration(typeof check.id === 'string' && CHECK_ID_PATTERN.test(check.id), `${label} id is invalid`);
      ensureConfiguration(!ids.has(check.id), `duplicate check id: ${check.id}`);
      ids.add(check.id);
      validatePath(check.path, `${label} path`);
      if (check.query !== undefined) {
        ensureConfiguration(typeof check.query === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(check.query),
          `${label} query is invalid`);
      }
      ensureConfiguration(Array.isArray(check.assertions) && check.assertions.length > 0,
        `${label} must have at least one assertion`);
      check.assertions.forEach((assertion, assertionIndex) => {
        validateAssertion(assertion, `${label} assertion ${assertionIndex}`);
      });
      if (check.forbiddenSelectors !== undefined) {
        ensureConfiguration(Array.isArray(check.forbiddenSelectors), `${label} forbiddenSelectors must be an array`);
        check.forbiddenSelectors.forEach((selector, selectorIndex) => {
          ensureConfiguration(typeof selector === 'string' && selector.length > 0 && selector.length <= 240,
            `${label} forbidden selector ${selectorIndex} is invalid`);
        });
      }
    }
  }
  return config.schemaVersion;
}

export function publicRoutePaths(document) {
  ensureConfiguration(isRecord(document) && document.schemaVersion === 1,
    'public route document schemaVersion must be 1');
  ensureConfiguration(isRecord(document.pages), 'public route document pages must be an object');
  const paths = Object.keys(document.pages);
  ensureConfiguration(paths.length > 0, 'public route document must contain pages');
  for (const path of paths) validatePath(path, 'route path');
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

export function sanitizeDiagnostic(value) {
  return String(value || 'observer check failed')
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, match => {
      try { return new URL(match).pathname || '/'; } catch { return '[url]'; }
    })
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:authorization|cookie|password|token|secret|state|code|email)\s*[:=]\s*[^\s,;]+/gi,
      field => `${field.split(/[:=]/, 1)[0]}=[redacted]`)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE_LENGTH) || 'observer check failed';
}

function safeFailure(error) {
  const code = typeof error?.code === 'string' && FAILURE_CODE_PATTERN.test(error.code)
    ? error.code
    : 'CHECK_FAILED';
  const stage = typeof error?.stage === 'string' && CHECK_ID_PATTERN.test(error.stage)
    ? error.stage
    : 'probe';
  return {
    code,
    stage,
    message: sanitizeDiagnostic(error instanceof Error ? error.message : error),
  };
}

export function normalizeObserverBaseUrl(value) {
  let parsed;
  try { parsed = new URL(String(value)); } catch { throw new ObserverConfigurationError('invalid observer base URL'); }
  ensureConfiguration(['http:', 'https:'].includes(parsed.protocol)
    && !parsed.username
    && !parsed.password
    && parsed.pathname === '/'
    && !parsed.search
    && !parsed.hash,
  'invalid observer base URL');
  return parsed.origin;
}

function eventClock(now) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  return {
    milliseconds: date.getTime(),
    timestamp: date.toISOString(),
  };
}

export async function runObserverChecks(options) {
  validateObserverConfig(options.config);
  const profile = String(options.profile || 'public').trim().toLowerCase();
  ensureConfiguration(['public', 'authenticated'].includes(profile), `unsupported observer profile: ${profile}`);
  if (profile === 'authenticated') {
    ensureConfiguration(typeof options.authCookie === 'string'
      && options.authCookie.length > 0
      && options.authCookie.length <= 4_096
      && !/[\u0000-\u001f\u007f]/.test(options.authCookie),
      'PRODUCTION_OBSERVER_AUTH_COOKIE is required for the authenticated profile');
  }
  normalizeObserverBaseUrl(options.baseUrl);
  ensureConfiguration(typeof options.routeProbe === 'function', 'routeProbe is required');
  ensureConfiguration(typeof options.browserProbe === 'function', 'browserProbe is required');
  const routes = [...new Set(options.publicRoutes || [])].sort((left, right) => left.localeCompare(right));
  routes.forEach(path => validatePath(path, 'route path'));

  const now = options.now || (() => new Date());
  const onEvent = options.onEvent || (() => {});
  const runId = String(options.runId || randomUUID());
  ensureConfiguration(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(runId), 'runId is invalid');
  let sequence = 0;
  const emit = payload => {
    const clock = eventClock(now);
    onEvent({
      schemaVersion: 1,
      runId,
      sequence: sequence += 1,
      timestamp: clock.timestamp,
      profile,
      ...payload,
    });
    return clock.milliseconds;
  };
  const failures = [];
  const results = [];
  emit({ event: 'run_started', status: 'running' });

  const execute = async ({ checkId, scope, path, operation }) => {
    const startedAt = eventClock(now).milliseconds;
    try {
      if (options.signal?.aborted) throw options.signal.reason;
      await operation();
      const durationMs = Math.max(0, eventClock(now).milliseconds - startedAt);
      const result = { checkId, scope, path, status: 'ok', durationMs };
      results.push(result);
      emit({ event: 'check_finished', ...result });
    } catch (error) {
      const durationMs = Math.max(0, eventClock(now).milliseconds - startedAt);
      const failure = { checkId, scope, path, ...safeFailure(error) };
      results.push({ checkId, scope, path, status: 'error', durationMs });
      failures.push(failure);
      emit({ event: 'check_finished', checkId, scope, path, status: 'error', durationMs, failure });
    }
  };

  for (const path of routes) {
    await execute({
      checkId: `route-${path === '/' ? 'home' : path.slice(1).replace(/[^a-z0-9]+/gi, '-')}`,
      scope: 'http',
      path,
      operation: () => options.routeProbe(path),
    });
  }
  for (const check of options.config.profiles[profile]) {
    await execute({
      checkId: check.id,
      scope: 'browser',
      path: check.path,
      operation: () => options.browserProbe(check),
    });
  }

  const counts = {
    total: results.length,
    passed: results.filter(result => result.status === 'ok').length,
    failed: failures.length,
  };
  const status = failures.length > 0 ? 'error' : 'ok';
  const report = { schemaVersion: 1, runId, profile, status, counts, results, failures };
  emit({ event: 'run_finished', status, counts, failures });
  if (failures.length > 0) throw new ObserverRunFailure(report);
  return report;
}
