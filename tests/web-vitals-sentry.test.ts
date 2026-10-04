import assert from 'node:assert/strict';
import {
  shouldSampleWebVitals,
  webVitalPage,
  webVitalPayload,
  webVitalsSampleRate,
} from '../src/telemetry/webVitals.js';
import type { LCPMetric, MetricType } from 'web-vitals';

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
  lcpTarget: 'none',
}, 'an LCP without an entry, such as a back-forward cache restore, names no element');

const cardImage = {
  tagName: 'IMG',
  classList: ['h-8', 'w-8'],
  textContent: 'Leeroy Jenkins',
  parentElement: { tagName: 'BUTTON', classList: ['constructed-card-detail__visual-button'], parentElement: null },
};
const lcpWithElement = {
  ...lcp,
  entries: [{ startTime: 1875, element: cardImage } as unknown as LargestContentfulPaint],
} satisfies LCPMetric;
assert.deepEqual(webVitalPayload(lcpWithElement), {
  name: 'LCP',
  value: 1875,
  rating: 'good',
  navigationType: 'navigate',
  lcpTarget: 'img.constructed-card-detail__visual-button',
});
assert.equal(JSON.stringify(webVitalPayload(lcpWithElement)).includes('Leeroy'), false, 'element text is never sent');

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

assert.equal('lcpTarget' in (webVitalPayload(cls) ?? {}), false, 'only LCP names an element');
assert.equal(webVitalPayload({ ...lcp, value: Number.NaN }), null);
assert.equal(webVitalPayload({ ...lcp, value: -1 }), null);

assert.deepEqual(webVitalPage('/standard/cards/standard/CARD_QA_0002/', false),
  { route: '/standard/cards/[format]/[cardId]/', device: 'mobile' });
assert.deepEqual(webVitalPage('/', true), { route: '/', device: 'desktop' });
assert.deepEqual(webVitalPage('/no-such-page/', true), { route: 'other', device: 'desktop' });

assert.equal(webVitalsSampleRate(undefined), 1);
assert.equal(webVitalsSampleRate(''), 1);
assert.equal(webVitalsSampleRate('0.25'), 0.25);
assert.equal(webVitalsSampleRate('invalid'), 0);
assert.equal(shouldSampleWebVitals('1', () => 0.99), true);
assert.equal(shouldSampleWebVitals('0', () => 0), false);
assert.equal(shouldSampleWebVitals('0.25', () => 0.2), true);
assert.equal(shouldSampleWebVitals('0.25', () => 0.3), false);

console.log('Web Vitals Sentry tests passed');
