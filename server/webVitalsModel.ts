export const WEB_VITAL_EDGE_REGIONS = [
  'eu-germany-limburg',
  'ru-moscow',
  'ru-novosibirsk',
  'origin',
  'unknown',
] as const;

export type WebVitalEdgeRegion = typeof WEB_VITAL_EDGE_REGIONS[number];

export type ServerWebVitalMetric = {
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
};

export type ServerWebVitalContext = {
  edgeRegion: WebVitalEdgeRegion;
};

const EDGE_REGION_SET = new Set<string>(WEB_VITAL_EDGE_REGIONS);

/**
 * Convert the trusted proxy header to a bounded metric dimension. Any missing,
 * duplicated, or unexpected value becomes `unknown`; raw input is never sent
 * to the telemetry backend.
 */
export function normalizeWebVitalEdgeRegion(value: unknown): WebVitalEdgeRegion {
  if (typeof value !== 'string' || !EDGE_REGION_SET.has(value)) return 'unknown';
  return value as WebVitalEdgeRegion;
}

export function webVitalMetricAttributes(
  metric: ServerWebVitalMetric,
  context: ServerWebVitalContext,
): Record<string, string> {
  return {
    rating: metric.rating,
    navigation_type: metric.navigationType,
    edge_region: context.edgeRegion,
  };
}
