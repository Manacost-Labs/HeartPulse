import * as Sentry from '@sentry/node';
import type { Express } from 'express';
import { boundedSampleRate, redactSentryEvent } from '../src/telemetry/sentryPrivacy.js';

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
  });
}

export const serverSentryConfigured = Boolean(dsn);

export function installSentryExpressErrorHandler(app: Express): boolean {
  if (!serverSentryConfigured) return false;
  Sentry.setupExpressErrorHandler(app);
  return true;
}
