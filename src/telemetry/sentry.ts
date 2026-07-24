import {
  boundedSampleRate,
  redactSentryEvent,
  redactSentryMetric,
} from './sentryPrivacy';

type SentryModule = typeof import('@sentry/react');
let initialization: Promise<SentryModule | null> | null = null;

function initializeClientSentry(): Promise<SentryModule | null> {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return Promise.resolve(null);

  initialization ??= import('@sentry/react').then(Sentry => {
    Sentry.init({
      dsn,
      environment: import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || import.meta.env.MODE,
      release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
      sendDefaultPii: false,
      tracesSampleRate: boundedSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
      beforeSend: event => redactSentryEvent(event),
      beforeSendTransaction: event => redactSentryEvent(event),
      beforeSendMetric: metric => redactSentryMetric(metric),
    });
    return Sentry;
  }).catch(error => {
    console.warn('[sentry] client initialization failed:', error instanceof Error ? error.message : error);
    return null;
  });
  return initialization;
}

export function initClientSentry(): Promise<boolean> {
  return initializeClientSentry().then(Boolean);
}

export function captureClientException(
  error: unknown,
  tags: { incidentId: string; incidentKind: string },
): void {
  void initializeClientSentry().then(Sentry => Sentry?.captureException(error, { tags }));
}
