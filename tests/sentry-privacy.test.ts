import assert from 'node:assert/strict';
import {
  boundedSampleRate,
  redactSentryEvent,
  redactSentryText,
  sentryPathOnly,
} from '../src/telemetry/sentryPrivacy.js';

assert.equal(boundedSampleRate(undefined), 0);
assert.equal(boundedSampleRate('0.05'), 0.05);
assert.equal(boundedSampleRate('9'), 1);
assert.equal(boundedSampleRate('-2'), 0);

assert.equal(sentryPathOnly('https://arena.hs-manacost.ru/api/profile?token=secret#x'), '/api/profile');
assert.equal(redactSentryText('admin@example.com bearer: abc123'), '[redacted] [redacted]');

const sanitized = redactSentryEvent({
  message: 'Ошибка для admin@example.com token=abc123',
  user: { id: '42', email: 'admin@example.com' },
  request: {
    method: 'POST',
    url: 'https://arena.hs-manacost.ru/api/admin?token=abc123',
    headers: { authorization: 'Bearer abc123' },
    cookies: 'session=abc123',
    data: { password: 'abc123' },
  },
  extra: { email: 'admin@example.com' },
  contexts: { auth: { token: 'abc123' } },
  tags: {
    incidentId: 'incident-safe',
    incidentKind: 'render',
    email: 'admin@example.com',
  },
  breadcrumbs: [{
    category: 'fetch',
    message: 'admin@example.com',
    data: { token: 'abc123' },
  }],
});

assert.equal(sanitized.user, undefined);
assert.equal(sanitized.extra, undefined);
assert.equal(sanitized.contexts, undefined);
assert.deepEqual(sanitized.request, { method: 'POST', url: '/api/admin' });
assert.deepEqual(sanitized.tags, { incidentId: 'incident-safe', incidentKind: 'render' });
assert.equal(sanitized.message, 'Ошибка для [redacted] [redacted]');
assert.deepEqual(sanitized.breadcrumbs, [{
  category: 'fetch',
  level: undefined,
  message: '[redacted]',
  timestamp: undefined,
}]);

console.log('Sentry privacy tests passed');
