import type { AppErrorKind } from '../components/appErrorRecovery';

export type AppIncidentDetails = {
  kind: AppErrorKind;
  releaseId: string;
  error?: unknown;
  componentStack?: string;
  scope?: string;
};

function errorDetails(error: unknown): { errorName: string; message: string; stack: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      message: error.message,
      stack: error.stack ?? '',
    };
  }
  return { errorName: typeof error, message: String(error ?? ''), stack: '' };
}

/** Send diagnostics only after a boundary catches an error, keeping the normal startup bundle unchanged. */
export function registerAppIncident(incidentId: string, details: AppIncidentDetails): void {
  if (typeof globalThis.fetch !== 'function') return;
  const error = errorDetails(details.error);
  const route = typeof window !== 'undefined' ? window.location.pathname : '/';
  void globalThis.fetch('/api/telemetry/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'omit',
    cache: 'no-store',
    keepalive: true,
    body: JSON.stringify({
      incidentId,
      kind: details.kind,
      releaseId: details.releaseId,
      route,
      scope: details.scope ?? '',
      ...error,
      componentStack: details.componentStack ?? '',
    }),
  }).catch(() => {});
}
