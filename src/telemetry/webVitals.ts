import type { MetricType } from 'web-vitals';
import { boundedSampleRate } from './sentryPrivacy';

let started = false;
let flushTimer: number | null = null;
const pendingMetrics = new Map<MetricType['name'], WebVitalPayload>();

export type WebVitalPayload = Pick<
  MetricType,
  'name' | 'value' | 'rating' | 'navigationType'
>;

export function webVitalPayload(metric: MetricType): WebVitalPayload | null {
  if (!Number.isFinite(metric.value) || metric.value < 0) return null;
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
  };
}

export function webVitalsSampleRate(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return 1;
  return boundedSampleRate(value);
}

export function shouldSampleWebVitals(
  value: unknown,
  random: () => number = Math.random,
): boolean {
  const rate = webVitalsSampleRate(value);
  return rate >= 1 || (rate > 0 && random() < rate);
}

function flushWebVitals(): void {
  if (flushTimer !== null) {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingMetrics.size === 0) return;
  const metrics = [...pendingMetrics.values()];
  pendingMetrics.clear();
  void fetch('/api/telemetry/web-vitals', {
    method: 'POST',
    credentials: 'omit',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metrics }),
  }).catch(() => {
    // RUM must never disrupt the page or retry during the same navigation.
  });
}

function queueWebVital(metric: MetricType): void {
  const payload = webVitalPayload(metric);
  if (!payload) return;
  pendingMetrics.set(payload.name, payload);
  if (flushTimer === null) {
    flushTimer = window.setTimeout(flushWebVitals, 3_000);
  }
}

/** `sampleRate` is the deployment's bounded 0..1 share of page loads to report; unset reports all. */
export async function startWebVitalsReporting(sampleRate?: unknown): Promise<boolean> {
  if (started) return true;
  if (!shouldSampleWebVitals(sampleRate)) return false;

  const {
    onCLS,
    onFCP,
    onINP,
    onLCP,
    onTTFB,
  } = await import('web-vitals');

  started = true;
  onCLS(queueWebVital);
  onFCP(queueWebVital);
  onINP(queueWebVital);
  onLCP(queueWebVital);
  onTTFB(queueWebVital);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') queueMicrotask(flushWebVitals);
  });
  window.addEventListener('pagehide', flushWebVitals);
  return true;
}
