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
};

export type ServerWebVitalContext = {
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

export function webVitalMetricAttributes(
  metric: ServerWebVitalMetric,
  context: ServerWebVitalContext,
): Record<string, string> {
  return {
    rating: metric.rating,
    navigation_type: metric.navigationType,
    edge_region: context.edgeRegion,
    client_region: context.clientRegion,
  };
}
