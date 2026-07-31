import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import {
  boundedSampleRate,
  redactSentryEvent,
  redactSentryMetric,
} from '../src/telemetry/sentryPrivacy.js';
import {
  type ServerWebVitalContext,
  type ServerWebVitalMetric,
  webVitalMetricAttributes,
} from './webVitalsModel.js';

export type { ServerWebVitalContext, ServerWebVitalMetric } from './webVitalsModel.js';

const dsn = process.env.SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'production',
    release: process.env.SENTRY_RELEASE?.trim()
      || process.env.RELEASE_SHA?.trim()
      || process.env.GITHUB_SHA?.trim()
      || undefined,
    sendDefaultPii: false,
    tracesSampleRate: boundedSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
    beforeSend: event => redactSentryEvent(event),
    beforeSendTransaction: event => redactSentryEvent(event),
    beforeSendMetric: metric => redactSentryMetric(metric),
  });
}

export const serverSentryConfigured = Boolean(dsn);

export function captureServerWebVital(
  metric: ServerWebVitalMetric,
  context: ServerWebVitalContext,
): boolean {
  if (!serverSentryConfigured) return false;
  Sentry.metrics.distribution(`web.vital.${metric.name.toLowerCase()}`, metric.value, {
    unit: metric.name === 'CLS' ? undefined : 'millisecond',
    attributes: webVitalMetricAttributes(metric, context),
  });
  return true;
}

export function installSentryExpressErrorHandler(app: Express): boolean {
  if (!serverSentryConfigured) return false;
  Sentry.setupExpressErrorHandler(app);
  return true;
}
