import {
  isWebVitalDevice,
  isWebVitalRoute,
  type WebVitalDevice,
  type WebVitalRoute,
} from '../shared/webVitalsDimensions.js';

export const WEB_VITAL_EDGE_REGIONS = [
  'eu-germany-limburg',
  'ru-moscow',
  'ru-novosibirsk',
  'origin',
  'unknown',
] as const;

export type WebVitalEdgeRegion = typeof WEB_VITAL_EDGE_REGIONS[number];

export const WEB_VITAL_CLIENT_REGIONS = [
  'russia',
  'europe',
  'north-america',
  'south-america',
  'asia',
  'oceania',
  'africa',
  'unknown',
] as const;

export type WebVitalClientRegion = typeof WEB_VITAL_CLIENT_REGIONS[number];

export type ServerWebVitalMetric = {
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
  /** LCP only: `tag` or `tag.class` from shared/webVitalsDimensions. */
  lcpTarget?: string;
};

/** `unknown` marks a report from a page loaded before these fields existed. */
export type ServerWebVitalPage = {
  route: WebVitalRoute | 'unknown';
  device: WebVitalDevice | 'unknown';
};

export type ServerWebVitalContext = ServerWebVitalPage & {
  edgeRegion: WebVitalEdgeRegion;
  clientRegion: WebVitalClientRegion;
};

const EDGE_REGION_SET = new Set<string>(WEB_VITAL_EDGE_REGIONS);
const CLIENT_REGION_SET = new Set<string>(WEB_VITAL_CLIENT_REGIONS);

/**
 * Convert the trusted proxy header to a bounded metric dimension. Any missing,
 * duplicated, or unexpected value becomes `unknown`; raw input is never sent
 * to the telemetry backend.
 */
export function normalizeWebVitalEdgeRegion(value: unknown): WebVitalEdgeRegion {
  if (typeof value !== 'string' || !EDGE_REGION_SET.has(value)) return 'unknown';
  return value as WebVitalEdgeRegion;
}

/**
 * Keep the visitor geography coarse and bounded. The trusted edge derives this
 * value before forwarding; raw addresses and arbitrary labels never reach the
 * metrics backend.
 */
export function normalizeWebVitalClientRegion(value: unknown): WebVitalClientRegion {
  if (typeof value !== 'string' || !CLIENT_REGION_SET.has(value)) return 'unknown';
  return value as WebVitalClientRegion;
}

/**
 * Read the page dimensions of a report body. A missing field becomes
 * `unknown` so pages opened before a release keep reporting; a present value
 * outside the allowlist rejects the whole report (`null`).
 */
export function normalizeWebVitalPage(body: Record<string, unknown>): ServerWebVitalPage | null {
  const route = optionalDimension(body.route, isWebVitalRoute);
  const device = optionalDimension(body.device, isWebVitalDevice);
  return route && device ? { route, device } : null;
}

function optionalDimension<T extends string>(
  value: unknown,
  isAllowed: (candidate: unknown) => candidate is T,
): T | 'unknown' | null {
  if (value === undefined) return 'unknown';
  return isAllowed(value) ? value : null;
}

export function webVitalMetricAttributes(
  metric: ServerWebVitalMetric,
  context: ServerWebVitalContext,
): Record<string, string> {
  return {
    rating: metric.rating,
    navigation_type: metric.navigationType,
    edge_region: context.edgeRegion,
    client_region: context.clientRegion,
    route: context.route,
    device: context.device,
    ...(metric.name === 'LCP' ? { lcp_target: metric.lcpTarget ?? 'unknown' } : {}),
  };
}
