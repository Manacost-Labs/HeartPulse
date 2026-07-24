import assert from 'node:assert/strict';
import {
  shouldSampleWebVitals,
  webVitalPayload,
  webVitalsSampleRate,
} from '../src/telemetry/webVitals.js';
import type { MetricType } from 'web-vitals';

const lcp = {
  name: 'LCP',
  value: 1875,
  rating: 'good',
  navigationType: 'navigate',
  delta: 1875,
  id: 'v4-test',
  entries: [],
  navigationId: 0,
} satisfies MetricType;
assert.deepEqual(webVitalPayload(lcp), {
  name: 'LCP',
  value: 1875,
  rating: 'good',
  navigationType: 'navigate',
});

const cls = {
  name: 'CLS',
  value: 0.04,
  rating: 'good',
  navigationType: 'back-forward-cache',
  delta: 0.04,
  id: 'v4-test',
  entries: [],
  navigationId: 0,
} satisfies MetricType;
assert.deepEqual(webVitalPayload(cls), {
  name: 'CLS',
  value: 0.04,
  rating: 'good',
  navigationType: 'back-forward-cache',
});

assert.equal(webVitalPayload({ ...lcp, value: Number.NaN }), null);
assert.equal(webVitalPayload({ ...lcp, value: -1 }), null);

assert.equal(webVitalsSampleRate(undefined), 1);
assert.equal(webVitalsSampleRate(''), 1);
assert.equal(webVitalsSampleRate('0.25'), 0.25);
assert.equal(webVitalsSampleRate('invalid'), 0);
assert.equal(shouldSampleWebVitals('1', () => 0.99), true);
assert.equal(shouldSampleWebVitals('0', () => 0), false);
assert.equal(shouldSampleWebVitals('0.25', () => 0.2), true);
assert.equal(shouldSampleWebVitals('0.25', () => 0.3), false);

console.log('Web Vitals Sentry tests passed');
