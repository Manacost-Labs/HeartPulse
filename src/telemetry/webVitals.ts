import type { MetricType } from 'web-vitals';
import {
  WEB_VITAL_DESKTOP_MEDIA_QUERY,
  type WebVitalDevice,
  type WebVitalRoute,
  webVitalLcpTarget,
  webVitalRouteTemplate,
} from '../../shared/webVitalsDimensions';
import { boundedSampleRate } from './sentryPrivacy';

let started = false;
let flushTimer: number | null = null;
let currentPage: WebVitalPage | null = null;
const pendingMetrics = new Map<MetricType['name'], WebVitalPayload>();
// LCP is finalized after the first input, when a client-side navigation may
// already have removed the element; candidates are described as they arrive.
const lcpCandidateTargets = new Map<number, string>();

export type WebVitalPayload = Pick<
  MetricType,
  'name' | 'value' | 'rating' | 'navigationType'
> & { lcpTarget?: string };

export type WebVitalPage = { route: WebVitalRoute; device: WebVitalDevice };

export function webVitalPage(pathname: string, desktop: boolean): WebVitalPage {
  return { route: webVitalRouteTemplate(pathname), device: desktop ? 'desktop' : 'mobile' };
}

function lcpTarget(metric: MetricType): string {
  const entry = metric.entries[metric.entries.length - 1] as LargestContentfulPaint | undefined;
  if (!entry) return webVitalLcpTarget(null);
  return lcpCandidateTargets.get(entry.startTime) ?? webVitalLcpTarget(entry.element);
}

export function webVitalPayload(metric: MetricType): WebVitalPayload | null {
  if (!Number.isFinite(metric.value) || metric.value < 0) return null;
  const payload: WebVitalPayload = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    navigationType: metric.navigationType,
  };
  if (metric.name === 'LCP') payload.lcpTarget = lcpTarget(metric);
  return payload;
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
    body: JSON.stringify({ ...currentPage, metrics }),
  }).catch(() => {
    // RUM must never disrupt the page or retry during the same navigation.
  });
}

function readPage(pathname: string): WebVitalPage {
  return webVitalPage(pathname, window.matchMedia(WEB_VITAL_DESKTOP_MEDIA_QUERY).matches);
}

/**
 * Like CrUX, every metric of a page load belongs to the URL the browser
 * loaded, even when INP or CLS accumulate after client-side navigations.
 */
function landingPathname(): string {
  const [navigation] = performance.getEntriesByType('navigation');
  try {
    if (navigation?.name) return new URL(navigation.name).pathname;
  } catch {
    // An unparsable entry falls back to the current location.
  }
  return window.location.pathname;
}

function observeLcpCandidates(): void {
  if (typeof PerformanceObserver === 'undefined'
    || !PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')) return;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries() as LargestContentfulPaint[]) {
      if (entry.element) lcpCandidateTargets.set(entry.startTime, webVitalLcpTarget(entry.element));
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
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
  currentPage = readPage(landingPathname());
  observeLcpCandidates();
  onCLS(queueWebVital);
  onFCP(queueWebVital);
  onINP(queueWebVital);
  onLCP(queueWebVital);
  onTTFB(queueWebVital);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') queueMicrotask(flushWebVitals);
  });
  window.addEventListener('pagehide', flushWebVitals);
  window.addEventListener('pageshow', event => {
    // A back-forward cache restore reports new values for the page shown now.
    if (event.persisted) currentPage = readPage(window.location.pathname);
  });
  return true;
}
